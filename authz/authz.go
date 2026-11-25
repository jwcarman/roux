// Package authz is roles and permissions: a person has roles, a role grants
// permissions, and what a person may do is the union of their roles' permissions.
//
// Permissions are plain strings ("users.read"), declared as constants by the module
// that checks them. Each module's migration grants them to the roles that should
// hold them (OWNER holds every permission); the application grants its own to its
// own roles in its own migration.
package authz

import (
	"context"
	"embed"
	"errors"
	"net/http"
	"slices"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/problem"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the roles-and-permissions schema, with the OWNER role.
var Migration = pgdb.Migration{Name: "roux-authz", FS: migrations, Dir: "migrations", After: []string{"roux-authn"}}

const (
	// RoleOwner holds every permission there is.
	RoleOwner = "OWNER"

	// Admin makes its holder an administrator: the last active one cannot be removed.
	Admin = "roux.admin"
)

// Role is a named set of permissions.
type Role struct {
	ID   uuid.UUID
	Name string
}

// Service reads and changes roles.
type Service struct{ Pool *pgxpool.Pool }

// PermissionsOf is authn.Config.Permissions: the sorted union of the permissions of
// the identity's roles.
func (s Service) PermissionsOf(ctx context.Context, identityID uuid.UUID) ([]string, error) {
	rows, err := s.Pool.Query(ctx, `
		select distinct rp.permission
		  from roux_identity_role ir
		  join roux_role_permission rp on rp.role_id = ir.role_id
		 where ir.identity_id = $1
		 order by rp.permission`, identityID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, pgx.RowTo[string])
}

var _ authn.PermissionsFunc = Service{}.PermissionsOf

// FindRole finds a role by name.
func FindRole(ctx context.Context, db authn.DBTX, name string) (Role, bool, error) {
	var r Role
	err := db.QueryRow(ctx, `select id, name from roux_role where name = $1`, name).Scan(&r.ID, &r.Name)
	if errors.Is(err, pgx.ErrNoRows) {
		return Role{}, false, nil
	}
	return r, err == nil, err
}

// RolesOf returns the identity's roles, sorted by name.
func RolesOf(ctx context.Context, db interface {
	Query(ctx context.Context, sql string, args ...any) (pgx.Rows, error)
}, identityID uuid.UUID) ([]Role, error) {
	rows, err := db.Query(ctx, `
		select r.id, r.name from roux_identity_role ir
		  join roux_role r on r.id = ir.role_id
		 where ir.identity_id = $1 order by r.name`, identityID)
	if err != nil {
		return nil, err
	}
	return pgx.CollectRows(rows, func(row pgx.CollectableRow) (Role, error) {
		var r Role
		return r, row.Scan(&r.ID, &r.Name)
	})
}

// Assign gives the identity the role; giving a role already held changes nothing.
func Assign(ctx context.Context, db authn.DBTX, identityID, roleID uuid.UUID) error {
	_, err := db.Exec(ctx,
		`insert into roux_identity_role (identity_id, role_id) values ($1, $2) on conflict do nothing`, identityID, roleID)
	return err
}

// Remove takes the role from the identity.
func Remove(ctx context.Context, db authn.DBTX, identityID, roleID uuid.UUID) error {
	_, err := db.Exec(ctx, `delete from roux_identity_role where identity_id = $1 and role_id = $2`, identityID, roleID)
	return err
}

// ErrLastAdmin means a change would leave no active identity able to manage people.
var ErrLastAdmin = errors.New("authz: the change would leave no active administrator")

// LastAdminProblem is how the API answers ErrLastAdmin: roux's last-admin problem.
func LastAdminProblem() *problem.Problem {
	p := problem.Conflict("The team needs someone active who can manage people")
	p.Type = "urn:roux:error:last-admin"
	p.Code = "last-admin"
	return p
}

// EnsureAdmin returns ErrLastAdmin unless some active identity holds
// Admin. Call it inside the transaction that deactivates someone or
// takes a role away, after the change, while holding a lock that serializes such
// changes: when it fails, roll the transaction back.
func EnsureAdmin(ctx context.Context, db authn.DBTX) error {
	var exists bool
	err := db.QueryRow(ctx, `
		select exists (
		  select 1 from roux_identity i
		   where i.status = $1
		     and exists (select 1 from roux_identity_role ir
		                   join roux_role_permission rp on rp.role_id = ir.role_id
		                  where ir.identity_id = i.id and rp.permission = $2))`,
		authn.StatusActive, Admin).Scan(&exists)
	if err != nil {
		return err
	}
	if !exists {
		return ErrLastAdmin
	}
	return nil
}

// Invitable is the roles an invitation may give, in the order configured (the
// invite form offers them in that order). OWNER is never one: owners are made at
// startup, never invited.
type Invitable struct{ names []string }

// NewInvitable checks the list: no blank entries and no OWNER.
func NewInvitable(names []string) (Invitable, error) {
	for _, n := range names {
		switch n {
		case "":
			return Invitable{}, errors.New("authz: the invitable roles have a blank entry")
		case RoleOwner:
			return Invitable{}, errors.New("authz: the invitable roles may not list OWNER: owners are never invited")
		}
	}
	return Invitable{names: slices.Clone(names)}, nil
}

// Names returns the roles in the order configured; never nil.
func (i Invitable) Names() []string {
	if i.names == nil {
		return []string{}
	}
	return slices.Clone(i.names)
}

// Contains reports whether an invitation may give the role.
func (i Invitable) Contains(role string) bool { return slices.Contains(i.names, role) }

// InvitablePath is where the invitable roles are served.
const InvitablePath = "/api/roux/roles/invitable"

// RegisterInvitable serves the roles an invite form offers, in the order configured,
// to anyone signed in. Roles are data, so the form asks rather than listing them itself.
func RegisterInvitable(mux *api.Mux, host *authn.Host, inv Invitable) {
	mux.HandleRoux("GET "+InvitablePath, host.Guard("", func(w http.ResponseWriter, r *http.Request) error {
		return api.JSON(w, http.StatusOK, inv.Names())
	}))
}
