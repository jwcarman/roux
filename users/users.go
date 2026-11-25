// Package users is roux's people: the directory, each person's page and history,
// inviting, renaming, changing roles, making owners, deactivating and reactivating,
// and signing someone out everywhere. Every change is recorded in the activity log
// against the person, in the transaction that makes it. One role per user, chosen
// from the invitable roles; the last person who can manage people stays.
//
// Permissions (the migration grants all four to OWNER):
//
//	users.read    list users, read one, with their history
//	users.invite  invite someone, or send their invitation again
//	users.manage  rename, change role, deactivate, reactivate, sign out everywhere
//	users.owners  make an existing user an owner (with a recent sign-in)
package users

import (
	"context"
	"embed"
	"errors"
	"fmt"
	"slices"
	"sort"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/page"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/problem"
)

//go:embed migrations/*.sql
var migrations embed.FS

// Migration is the users' schema: after who's, the roles, the email addresses the
// directory reads, and the activity log.
var Migration = pgdb.Migration{
	Name: "roux-users", FS: migrations, Dir: "migrations",
	After: []string{"roux-authn", "roux-authz", "roux-authn-emaillink", "roux-activity"},
}

// The permissions the endpoints check.
const (
	UsersRead   = "users.read"
	UsersInvite = "users.invite"
	UsersManage = "users.manage"
	UsersOwners = "users.owners"
)

// MaxNameLength is the longest display name, after trimming.
const MaxNameLength = 80

// Statuses a user shows.
const (
	StatusActive      = "ACTIVE"
	StatusDeactivated = "DEACTIVATED"
)

// changeLock serializes status and role changes, so two at once cannot both pass the
// checks that keep an administrator. It is held for the length of the transaction.
const changeLock int64 = 0x726f7578_75736572

// ownerLock serializes concurrent starts making the first owner.
const ownerLock int64 = 0x726f7578_6f776e65

// Me is the signed-in user as they see themselves.
type Me struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"displayName"`
	Email       *string   `json:"email"` // their oldest sign-in address
	Version     int64     `json:"version"`
}

// Row is one user in the list.
type Row struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"displayName"`
	Email       *string   `json:"email"`
	Role        *string   `json:"role"`
	Status      string    `json:"status"`
}

// Detail is one user, for their page.
type Detail struct {
	ID          uuid.UUID `json:"id"`
	DisplayName string    `json:"displayName"`
	Email       *string   `json:"email"`
	Role        *string   `json:"role"`
	Status      string    `json:"status"`
	JoinedAt    time.Time `json:"joinedAt"`
	Invited     bool      `json:"invited"` // never signed in, so the invitation can be sent again
	Version     int64     `json:"version"`
}

// Filter says which users a list shows. The search matches as roux's lists do: every
// word, whatever its case, in the name or the email (% and _ taken literally); a blank
// search matches everyone. A missing status is ACTIVE.
type Filter struct {
	Search string
	Role   string
	Status string
}

// ListConfig is how the list pages and sorts: by name (the default), email, role or
// when they joined, with the id as the tiebreaker.
var ListConfig = page.Config{
	SortFields:  []string{"NAME", "EMAIL", "ROLE", "JOINED"},
	DefaultSort: "NAME",
}

// sortColumns maps the allowlisted sort fields to SQL; nothing else reaches ORDER BY.
var sortColumns = map[string]string{
	"NAME": "lower(display_name)", "EMAIL": "lower(email)", "ROLE": "role", "JOINED": "joined_at", "ID": "id",
}

// Service is the users.
type Service struct {
	Pool *pgxpool.Pool
	// Host ends sessions (sign out everywhere).
	Host *authn.Host
	// Email sends invitations and registers addresses.
	Email *emaillink.Method
	// Invitable is the roles an invitation, or a role change, may give.
	Invitable authz.Invitable
	// Clock is the time source; default time.Now.
	Clock func() time.Time
}

func (s Service) now() time.Time {
	if s.Clock != nil {
		return s.Clock().UTC()
	}
	return time.Now().UTC()
}

// NotFound is the 404 for an id that is no user's.
func NotFound() *problem.Problem { return problem.NotFound("No such user") }

type entry struct {
	id          uuid.UUID
	version     int64
	displayName string
	email, role *string
	status      string
	joinedAt    time.Time
	invited     bool
}

const entryColumns = `id, version, display_name, email, role, status, joined_at, invited`

func scanEntry(row pgx.Row) (entry, error) {
	var e entry
	err := row.Scan(&e.id, &e.version, &e.displayName, &e.email, &e.role, &e.status, &e.joinedAt, &e.invited)
	e.joinedAt = e.joinedAt.UTC()
	return e, err
}

func (e entry) me() Me {
	return Me{ID: e.id, DisplayName: e.displayName, Email: e.email, Version: e.version}
}
func (e entry) row() Row {
	return Row{ID: e.id, DisplayName: e.displayName, Email: e.email, Role: e.role, Status: e.status}
}
func (e entry) detail() Detail {
	return Detail{ID: e.id, DisplayName: e.displayName, Email: e.email, Role: e.role, Status: e.status,
		JoinedAt: e.joinedAt, Invited: e.invited, Version: e.version}
}

type queryer interface {
	QueryRow(ctx context.Context, sql string, args ...any) pgx.Row
}

func (s Service) entry(ctx context.Context, db queryer, id uuid.UUID) (entry, error) {
	e, err := scanEntry(db.QueryRow(ctx, `select `+entryColumns+` from roux_user_directory where id = $1`, id))
	if errors.Is(err, pgx.ErrNoRows) {
		return entry{}, NotFound()
	}
	return e, err
}

// inTx runs fn in a transaction, committing if it returns nil.
func (s Service) inTx(ctx context.Context, fn func(tx pgx.Tx) error) error {
	tx, err := s.Pool.Begin(ctx)
	if err != nil {
		return err
	}
	defer tx.Rollback(ctx) //nolint:errcheck // a no-op after commit
	if err := fn(tx); err != nil {
		return err
	}
	return tx.Commit(ctx)
}

func lock(ctx context.Context, tx pgx.Tx, key int64) error {
	_, err := tx.Exec(ctx, `select pg_advisory_xact_lock($1)`, key)
	return err
}

func actorOf(ctx context.Context) *string {
	if p := authn.PrincipalFrom(ctx); p != nil {
		id := p.IdentityID.String()
		return &id
	}
	return nil
}

// Me is the signed-in user.
func (s Service) Me(ctx context.Context, id uuid.UUID) (Me, error) {
	e, err := s.entry(ctx, s.Pool, id)
	return e.me(), err
}

// Detail is one user.
func (s Service) Detail(ctx context.Context, id uuid.UUID) (Detail, error) {
	e, err := s.entry(ctx, s.Pool, id)
	return e.detail(), err
}

// escapeLike makes a word match literally inside a LIKE pattern.
func escapeLike(word string) string {
	return strings.NewReplacer(`\`, `\\`, `%`, `\%`, `_`, `\_`).Replace(word)
}

const maxSearchWords = 10

func searchWords(search string) []string {
	var words []string
	for _, w := range strings.Fields(strings.ToLower(search)) {
		if !slices.Contains(words, w) && len(words) < maxSearchWords {
			words = append(words, w)
		}
	}
	return words
}

// List is a page of users.
func (s Service) List(ctx context.Context, req page.Request, f Filter) (page.Page[Row], error) {
	status := f.Status
	if status == "" {
		status = StatusActive
	}
	if f.Role != "" {
		if _, found, err := authz.FindRole(ctx, s.Pool, f.Role); err != nil {
			return page.Page[Row]{}, err
		} else if !found {
			return page.Page[Row]{}, problem.InvalidField("role", "No such role")
		}
	}

	args := []any{status}
	where := []string{"status = $1"}
	for _, w := range searchWords(f.Search) {
		args = append(args, "%"+escapeLike(w)+"%")
		n := len(args)
		where = append(where, fmt.Sprintf(`(lower(display_name) like $%d escape '\' or lower(coalesce(email, '')) like $%d escape '\')`, n, n))
	}
	if f.Role != "" {
		args = append(args, f.Role)
		where = append(where, fmt.Sprintf("role = $%d", len(args)))
	}
	clause := strings.Join(where, " and ")

	var total int64
	if err := s.Pool.QueryRow(ctx, `select count(*) from roux_user_directory where `+clause, args...).Scan(&total); err != nil {
		return page.Page[Row]{}, err
	}
	var order []string
	for _, so := range req.Sorts() {
		col, ok := sortColumns[so.Field]
		if !ok {
			return page.Page[Row]{}, fmt.Errorf("users: no column for sort field %q", so.Field)
		}
		order = append(order, col+" "+string(so.Direction))
	}
	args = append(args, req.Size, req.Offset())
	rows, err := s.Pool.Query(ctx, fmt.Sprintf(`select %s from roux_user_directory where %s order by %s limit $%d offset $%d`,
		entryColumns, clause, strings.Join(order, ", "), len(args)-1, len(args)), args...)
	if err != nil {
		return page.Page[Row]{}, err
	}
	entries, err := pgx.CollectRows(rows, func(r pgx.CollectableRow) (entry, error) { return scanEntry(r) })
	if err != nil {
		return page.Page[Row]{}, err
	}
	data := make([]Row, len(entries))
	for i, e := range entries {
		data[i] = e.row()
	}
	return page.Of(data, req, total), nil
}

// Names is activity.Names over the users' display names.
func (s Service) Names(ctx context.Context, ids []uuid.UUID) (map[uuid.UUID]string, error) {
	rows, err := s.Pool.Query(ctx, `select id, display_name from roux_user where id = any($1)`, ids)
	if err != nil {
		return nil, err
	}
	out := map[uuid.UUID]string{}
	for rows.Next() {
		var id uuid.UUID
		var name string
		if err := rows.Scan(&id, &name); err != nil {
			return nil, err
		}
		out[id] = name
	}
	return out, rows.Err()
}

// Activities is a user's history, newest first.
func (s Service) Activities(ctx context.Context, id uuid.UUID, req page.Request) (page.Page[activity.Entry], error) {
	if _, err := s.entry(ctx, s.Pool, id); err != nil {
		return page.Page[activity.Entry]{}, err
	}
	return activity.History(ctx, s.Pool, s.Names, id, req)
}

// Invite makes someone a user with the role and sends their invitation. The person,
// their address, their role and the record that they were invited commit together; the
// email goes after. linkSent says whether it did: the invitation stands either way.
func (s Service) Invite(ctx context.Context, name, email, role string) (linkSent bool, err error) {
	if !s.Invitable.Contains(role) {
		return false, problem.InvalidField("role", "That role cannot be given")
	}
	now, actor := s.now(), actorOf(ctx)
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if err := mayGive(ctx, tx, role); err != nil {
			return err
		}
		id, err := authn.CreateIdentity(ctx, tx, now)
		if err != nil {
			return err
		}
		if err := s.Email.RegisterIn(ctx, tx, id, email); err != nil {
			if errors.Is(err, emaillink.ErrAddressTaken) {
				return problem.InvalidField("email", "That address already belongs to a user")
			}
			return err
		}
		r, found, err := authz.FindRole(ctx, tx, role)
		if err != nil {
			return err
		}
		if !found {
			return fmt.Errorf("users: the invitable role %q does not exist: create it in a migration", role)
		}
		if err := authz.Assign(ctx, tx, id, r.ID); err != nil {
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into roux_user (id, version, display_name, created_date, modified_date, created_by, modified_by)
			values ($1, 0, $2, $3, $3, $4, $4)`, id, name, now, actor); err != nil {
			return err
		}
		return activity.Append(ctx, tx, now, id, UserInvited{Name: name})
	})
	if err != nil {
		return false, err
	}
	return s.Email.Invite(ctx, email) == emaillink.Sent, nil
}

// ResendInvitation sends an invitation again to someone who has never signed in.
func (s Service) ResendInvitation(ctx context.Context, id uuid.UUID) (bool, error) {
	e, err := s.entry(ctx, s.Pool, id)
	if err != nil {
		return false, err
	}
	if !e.invited {
		return false, problem.Conflict("Already signed in")
	}
	outcome, err := s.Email.ResendInvitation(ctx, id)
	if errors.Is(err, emaillink.ErrNoAddress) {
		return false, problem.BadRequest("They have no email address to send to")
	}
	return outcome == emaillink.Sent, err
}

// rename changes a user's name in tx, from the version the caller read.
func (s Service) rename(ctx context.Context, tx pgx.Tx, id uuid.UUID, name string, version *int64) error {
	var current int64
	var before string
	err := tx.QueryRow(ctx, `select version, display_name from roux_user where id = $1 for update`, id).Scan(&current, &before)
	if errors.Is(err, pgx.ErrNoRows) {
		return NotFound()
	}
	if err != nil {
		return err
	}
	if version == nil {
		return problem.InvalidField("version", problem.MustNotBeEmpty)
	}
	if *version != current {
		return problem.StaleVersion()
	}
	if name == before {
		return nil // nothing to change, so nothing to record and no new version
	}
	now := s.now()
	if _, err := tx.Exec(ctx,
		`update roux_user set display_name = $2, version = version + 1, modified_date = $3, modified_by = $4 where id = $1`,
		id, name, now, actorOf(ctx)); err != nil {
		return err
	}
	return activity.Append(ctx, tx, now, id, UserRenamed{From: before, To: name})
}

// RenameMe renames the signed-in user.
func (s Service) RenameMe(ctx context.Context, id uuid.UUID, name string, version *int64) (Me, error) {
	if err := s.inTx(ctx, func(tx pgx.Tx) error { return s.rename(ctx, tx, id, name, version) }); err != nil {
		return Me{}, err
	}
	return s.Me(ctx, id)
}

// Rename renames a user.
func (s Service) Rename(ctx context.Context, id uuid.UUID, name string, version *int64) (Detail, error) {
	if err := s.inTx(ctx, func(tx pgx.Tx) error { return s.rename(ctx, tx, id, name, version) }); err != nil {
		return Detail{}, err
	}
	return s.Detail(ctx, id)
}

// giveOnly gives the user the role in place of every role they hold, keeping an
// administrator: it fails with the last-admin problem if the change would leave none.
func (s Service) giveOnly(ctx context.Context, tx pgx.Tx, id uuid.UUID, role string) error {
	current, err := authz.RolesOf(ctx, tx, id)
	if err != nil {
		return err
	}
	if len(current) == 1 && current[0].Name == role {
		return nil
	}
	chosen, found, err := authz.FindRole(ctx, tx, role)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("users: the role %q does not exist", role)
	}
	names := make([]string, 0, len(current))
	held := false
	for _, old := range current {
		names = append(names, old.Name)
		if old.ID == chosen.ID {
			held = true
			continue
		}
		if err := authz.Remove(ctx, tx, id, old.ID); err != nil {
			return err
		}
	}
	if !held {
		if err := authz.Assign(ctx, tx, id, chosen.ID); err != nil {
			return err
		}
	}
	if err := s.requireAdmin(ctx, tx); err != nil {
		return err
	}
	sort.Strings(names)
	return activity.Append(ctx, tx, s.now(), id, UserRoleChanged{From: strings.Join(names, ", "), To: role})
}

// mayManage refuses a change to an owner by anyone who may not manage owners (403), and asks a
// caller who may for a recent sign-in, as making an owner does: users.manage alone must not
// reach the people who run the team.
func (s Service) mayManage(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	roles, err := authz.RolesOf(ctx, tx, id)
	if err != nil {
		return err
	}
	if !slices.ContainsFunc(roles, func(r authz.Role) bool { return r.Name == authz.RoleOwner }) {
		return nil
	}
	if p := authn.PrincipalFrom(ctx); p == nil || !p.Has(UsersOwners) {
		return problem.Forbidden()
	}
	return s.Host.RequireRecentSignIn(ctx)
}

// mayGive refuses a role holding a permission the caller does not: whoever may invite or manage
// people hands on at most what they have themselves.
func mayGive(ctx context.Context, tx pgx.Tx, role string) error {
	p := authn.PrincipalFrom(ctx)
	if p == nil {
		return nil // roux itself, such as the first owner at startup
	}
	rows, err := tx.Query(ctx, `
		select rp.permission
		  from roux_role_permission rp
		  join roux_role r on r.id = rp.role_id
		 where r.name = $1`, role)
	if err != nil {
		return err
	}
	permissions, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	for _, permission := range permissions {
		if !p.Has(permission) {
			return problem.InvalidField("role", "You cannot give a role with permissions you do not hold")
		}
	}
	return nil
}

func (s Service) requireAdmin(ctx context.Context, tx pgx.Tx) error {
	if err := authz.EnsureAdmin(ctx, tx); errors.Is(err, authz.ErrLastAdmin) {
		return authz.LastAdminProblem()
	} else {
		return err
	}
}

func (s Service) exists(ctx context.Context, tx pgx.Tx, id uuid.UUID) error {
	var n int
	err := tx.QueryRow(ctx, `select 1 from roux_user where id = $1`, id).Scan(&n)
	if errors.Is(err, pgx.ErrNoRows) {
		return NotFound()
	}
	return err
}

// ChangeRole gives a user a new role, in place of every role they hold. The role must
// be one an invitation may give, and hold nothing the caller does not; changing an owner
// takes users.owners and a recent sign-in.
func (s Service) ChangeRole(ctx context.Context, id uuid.UUID, role string) (Detail, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := lock(ctx, tx, changeLock); err != nil {
			return err
		}
		if err := s.exists(ctx, tx, id); err != nil {
			return err
		}
		if !s.Invitable.Contains(role) {
			return problem.InvalidField("role", "That role cannot be given")
		}
		if err := s.mayManage(ctx, tx, id); err != nil {
			return err
		}
		if err := mayGive(ctx, tx, role); err != nil {
			return err
		}
		return s.giveOnly(ctx, tx, id, role)
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Detail(ctx, id)
}

// MakeOwner makes an existing user an owner, in place of their role. Invitations and
// ChangeRole never give OWNER; the endpoint asks for users.owners and a recent sign-in.
func (s Service) MakeOwner(ctx context.Context, id uuid.UUID) (Detail, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := lock(ctx, tx, changeLock); err != nil {
			return err
		}
		if err := s.exists(ctx, tx, id); err != nil {
			return err
		}
		return s.giveOnly(ctx, tx, id, authz.RoleOwner)
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Detail(ctx, id)
}

func (s Service) setStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID, status string) error {
	_, err := tx.Exec(ctx, `update roux_identity set status = $2, updated_at = $3 where id = $1`, id, status, s.now())
	return err
}

func identityStatus(ctx context.Context, tx pgx.Tx, id uuid.UUID) (string, error) {
	var status string
	err := tx.QueryRow(ctx, `select i.status from roux_identity i join roux_user u on u.id = i.id where i.id = $1`, id).Scan(&status)
	if errors.Is(err, pgx.ErrNoRows) {
		return "", NotFound()
	}
	return status, err
}

// Deactivate stops someone from signing in, and ends their sessions.
func (s Service) Deactivate(ctx context.Context, actor, id uuid.UUID) (Detail, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := lock(ctx, tx, changeLock); err != nil {
			return err
		}
		status, err := identityStatus(ctx, tx, id)
		if err != nil {
			return err
		}
		if id == actor {
			return problem.BadRequest("You cannot deactivate yourself")
		}
		if status != authn.StatusActive {
			return problem.Conflict("Already deactivated")
		}
		if err := s.mayManage(ctx, tx, id); err != nil {
			return err
		}
		if err := s.setStatus(ctx, tx, id, authn.StatusDisabled); err != nil {
			return err
		}
		// Ended now, not at their next request: reactivated before then, they would come back.
		if err := authn.EndSessions(ctx, tx, id, s.now()); err != nil {
			return err
		}
		if err := s.requireAdmin(ctx, tx); err != nil {
			return err
		}
		return activity.Append(ctx, tx, s.now(), id, UserDeactivated{})
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Detail(ctx, id)
}

// Reactivate lets someone sign in again.
func (s Service) Reactivate(ctx context.Context, id uuid.UUID) (Detail, error) {
	err := s.inTx(ctx, func(tx pgx.Tx) error {
		if err := lock(ctx, tx, changeLock); err != nil {
			return err
		}
		status, err := identityStatus(ctx, tx, id)
		if err != nil {
			return err
		}
		if status == authn.StatusActive {
			return problem.Conflict("Already active")
		}
		if err := s.setStatus(ctx, tx, id, authn.StatusActive); err != nil {
			return err
		}
		return activity.Append(ctx, tx, s.now(), id, UserReactivated{})
	})
	if err != nil {
		return Detail{}, err
	}
	return s.Detail(ctx, id)
}

// SignOutEverywhere ends every session the user has, on every device.
func (s Service) SignOutEverywhere(ctx context.Context, id uuid.UUID) error {
	if _, err := s.entry(ctx, s.Pool, id); err != nil {
		return err
	}
	return s.Host.EndAllSessions(ctx, id)
}

// FirstSignIn records a user's first sign-in, which the directory's invited flag
// reads. Register hooks it to who's sign-ins.
func (s Service) FirstSignIn(ctx context.Context, id uuid.UUID, at time.Time) error {
	_, err := s.Pool.Exec(ctx,
		`update roux_user set first_signed_in_at = $2 where id = $1 and first_signed_in_at is null`, id, at)
	return err
}

// BootstrapOwner makes the first owner: while no active identity holds OWNER, it
// creates one that signs in with email, named name. Once an active owner exists it
// changes nothing; if none is active, the next start makes one again. An advisory lock
// serializes concurrent starts. It fails if no owner exists and the address belongs to
// another identity: it will not take an address from someone.
func (s Service) BootstrapOwner(ctx context.Context, email, name string) (created bool, err error) {
	name = strings.TrimSpace(name)
	if name == "" || len(name) > MaxNameLength {
		return false, fmt.Errorf("users: the owner's name must be 1 to %d characters", MaxNameLength)
	}
	now := s.now()
	err = s.inTx(ctx, func(tx pgx.Tx) error {
		if err := lock(ctx, tx, ownerLock); err != nil {
			return err
		}
		var exists bool
		if err := tx.QueryRow(ctx, `
			select exists (select 1 from roux_identity_role ir
			                 join roux_role r on r.id = ir.role_id
			                 join roux_identity i on i.id = ir.identity_id
			                where r.name = $1 and i.status = $2)`, authz.RoleOwner, authn.StatusActive).Scan(&exists); err != nil {
			return err
		}
		if exists {
			return nil
		}
		id, err := authn.CreateIdentity(ctx, tx, now)
		if err != nil {
			return err
		}
		owner, found, err := authz.FindRole(ctx, tx, authz.RoleOwner)
		if err != nil {
			return err
		}
		if !found {
			return errors.New("users: the OWNER role does not exist: the rbac migration has not run")
		}
		if err := authz.Assign(ctx, tx, id, owner.ID); err != nil {
			return err
		}
		if err := s.Email.RegisterIn(ctx, tx, id, email); err != nil {
			if errors.Is(err, emaillink.ErrAddressTaken) {
				return fmt.Errorf("users: no active OWNER exists and the owner's address belongs to another identity: set it to a free address")
			}
			return err
		}
		if _, err := tx.Exec(ctx, `
			insert into roux_user (id, version, display_name, created_date, modified_date)
			values ($1, 0, $2, $3, $3)`, id, name, now); err != nil {
			return err
		}
		created = true
		return nil
	})
	return created, err
}

// SignUp makes the identity a user, in the transaction that creates it (provider sign-up):
// the name the person saw at the provider, the role, and the record that they signed up.
// The name is trimmed and shortened to fit; a blank one becomes "New user".
func (s Service) SignUp(ctx context.Context, tx pgx.Tx, id uuid.UUID, name, role string) error {
	if !s.Invitable.Contains(role) {
		return fmt.Errorf("users: sign-up role %q is not an invitable role", role)
	}
	name = strings.TrimSpace(name)
	if r := []rune(name); len(r) > MaxNameLength {
		name = strings.TrimSpace(string(r[:MaxNameLength]))
	}
	if name == "" {
		name = "New user"
	}
	r, found, err := authz.FindRole(ctx, tx, role)
	if err != nil {
		return err
	}
	if !found {
		return fmt.Errorf("users: the sign-up role %q does not exist: create it in a migration", role)
	}
	if err := authz.Assign(ctx, tx, id, r.ID); err != nil {
		return err
	}
	now := s.now()
	if _, err := tx.Exec(ctx, `
		insert into roux_user (id, version, display_name, created_date, modified_date, created_by, modified_by)
		values ($1, 0, $2, $3, $3, 'sign-up', 'sign-up')`, id, name, now); err != nil {
		return err
	}
	return activity.Append(ctx, tx, now, id, UserSignedUp{Name: name})
}
