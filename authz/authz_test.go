package authz_test

import (
	"context"
	"errors"
	"slices"
	"strings"
	"testing"
	"time"

	"github.com/google/uuid"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/pgtest"
)

func setup(t *testing.T) (*pgxpool.Pool, authz.Service) {
	t.Helper()
	pool := pgtest.Pool(t, "rbac")
	if err := pgdb.Migrate(context.Background(), pool, authn.Migration, authz.Migration); err != nil {
		t.Fatal(err)
	}
	return pool, authz.Service{Pool: pool}
}

func identity(t *testing.T, pool *pgxpool.Pool) uuid.UUID {
	t.Helper()
	id, err := authn.CreateIdentity(context.Background(), pool, time.Now())
	if err != nil {
		t.Fatal(err)
	}
	return id
}

func role(t *testing.T, pool *pgxpool.Pool, name string, perms ...string) authz.Role {
	t.Helper()
	ctx := context.Background()
	r := authz.Role{ID: uuid.New(), Name: name}
	if _, err := pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2)`, r.ID, name); err != nil {
		t.Fatal(err)
	}
	for _, p := range perms {
		if _, err := pool.Exec(ctx, `insert into roux_role_permission (role_id, permission) values ($1, $2)`, r.ID, p); err != nil {
			t.Fatal(err)
		}
	}
	return r
}

func TestOwnerIsSeededWithTheIdentityPermissions(t *testing.T) {
	pool, svc := setup(t)
	owner, found, err := authz.FindRole(context.Background(), pool, authz.RoleOwner)
	if err != nil || !found || owner.Name != "OWNER" {
		t.Fatalf("OWNER: %+v %v %v", owner, found, err)
	}
	id := identity(t, pool)
	if err := authz.Assign(context.Background(), pool, id, owner.ID); err != nil {
		t.Fatal(err)
	}
	got, err := svc.PermissionsOf(context.Background(), id)
	if err != nil || !slices.Equal(got, []string{"roux.admin"}) {
		t.Fatalf("OWNER permissions: %v %v", got, err)
	}
	if _, found, _ := authz.FindRole(context.Background(), pool, "NOBODY"); found {
		t.Fatal("found a role that does not exist")
	}
}

func TestPermissionsAreTheSortedUnionOfTheRoles(t *testing.T) {
	pool, svc := setup(t)
	ctx := context.Background()
	id := identity(t, pool)
	if got, err := svc.PermissionsOf(ctx, id); err != nil || got == nil || len(got) != 0 {
		t.Fatalf("no roles: %v %v (want empty, not nil)", got, err)
	}
	a := role(t, pool, "a", "x.read", "z.use")
	b := role(t, pool, "b", "x.read", "m.use")
	for _, r := range []authz.Role{a, b} {
		if err := authz.Assign(ctx, pool, id, r.ID); err != nil {
			t.Fatal(err)
		}
	}
	if err := authz.Assign(ctx, pool, id, a.ID); err != nil { // assigning twice is harmless
		t.Fatal(err)
	}
	if got, _ := svc.PermissionsOf(ctx, id); !slices.Equal(got, []string{"m.use", "x.read", "z.use"}) {
		t.Fatalf("union = %v", got)
	}
	roles, err := authz.RolesOf(ctx, pool, id)
	if err != nil || len(roles) != 2 || roles[0].Name != "a" || roles[1].Name != "b" {
		t.Fatalf("roles: %+v %v", roles, err)
	}
	if err := authz.Remove(ctx, pool, id, a.ID); err != nil {
		t.Fatal(err)
	}
	if got, _ := svc.PermissionsOf(ctx, id); !slices.Equal(got, []string{"m.use", "x.read"}) {
		t.Fatalf("after removing a role: %v", got)
	}
}

func TestEnsureAdminKeepsSomeoneActiveWhoCanManagePeople(t *testing.T) {
	pool, _ := setup(t)
	ctx := context.Background()
	owner, _, _ := authz.FindRole(ctx, pool, authz.RoleOwner)

	if err := authz.EnsureAdmin(ctx, pool); !errors.Is(err, authz.ErrLastAdmin) {
		t.Fatalf("nobody holds it yet: %v", err)
	}
	first, second := identity(t, pool), identity(t, pool)
	if err := authz.Assign(ctx, pool, first, owner.ID); err != nil {
		t.Fatal(err)
	}
	if err := authz.EnsureAdmin(ctx, pool); err != nil {
		t.Fatalf("one active administrator: %v", err)
	}

	// A disabled administrator does not count.
	if _, err := pool.Exec(ctx, `update roux_identity set status = $2 where id = $1`, first, authn.StatusDisabled); err != nil {
		t.Fatal(err)
	}
	if err := authz.EnsureAdmin(ctx, pool); !errors.Is(err, authz.ErrLastAdmin) {
		t.Fatalf("a disabled administrator counted: %v", err)
	}
	if err := authz.Assign(ctx, pool, second, owner.ID); err != nil {
		t.Fatal(err)
	}
	if err := authz.EnsureAdmin(ctx, pool); err != nil {
		t.Fatalf("a second, active one: %v", err)
	}

	// Any role carrying the permission makes an administrator, not only OWNER.
	if _, err := pool.Exec(ctx, `update roux_identity set status = $2 where id = $1`, second, authn.StatusDisabled); err != nil {
		t.Fatal(err)
	}
	third := identity(t, pool)
	if err := authz.Assign(ctx, pool, third, role(t, pool, "manager", authz.Admin).ID); err != nil {
		t.Fatal(err)
	}
	if err := authz.EnsureAdmin(ctx, pool); err != nil {
		t.Fatalf("a custom role with the permission: %v", err)
	}

	p := authz.LastAdminProblem()
	if p.Status != 409 || p.Code != "last-admin" || p.Type != "urn:roux:error:last-admin" ||
		p.Detail != "The team needs someone active who can manage people" {
		t.Fatalf("last-admin problem: %+v", p)
	}
}

func TestInvitableRoles(t *testing.T) {
	inv, err := authz.NewInvitable([]string{"USER", "COACH"})
	if err != nil {
		t.Fatal(err)
	}
	if !inv.Contains("COACH") || inv.Contains("OWNER") || inv.Contains("") {
		t.Fatal("Contains")
	}
	names := inv.Names()
	names[0] = "TAMPERED"
	if inv.Names()[0] != "USER" {
		t.Fatal("Names must return a copy")
	}
	if got := (authz.Invitable{}).Names(); got == nil || len(got) != 0 {
		t.Fatalf("no roles: %v (want an empty list, never nil: it is sent as JSON)", got)
	}
	for _, bad := range [][]string{{"USER", ""}, {"OWNER"}, {"USER", "OWNER"}} {
		if _, err := authz.NewInvitable(bad); err == nil || !strings.Contains(err.Error(), "invitable") {
			t.Errorf("NewInvitable(%v) = %v, want an error", bad, err)
		}
	}
}

func TestInvitableRolesEndpoint(t *testing.T) {
	env := authntest.New(t, "rbac_endpoint")
	inv, _ := authz.NewInvitable([]string{"USER", "COACH"})
	authz.RegisterInvitable(env.Mux, env.Host, inv)
	empty := authntest.New(t, "rbac_endpoint_empty")
	authz.RegisterInvitable(empty.Mux, empty.Host, authz.Invitable{})
	env.Serve()
	empty.Serve()

	if r := env.Browser().Get("/api/roux/roles/invitable"); r.StatusCode != 401 {
		t.Fatalf("anonymous: %d", r.StatusCode)
	}
	b := env.SignedIn(env.Identity()) // signed in, no permission needed
	r := b.Get("/api/roux/roles/invitable")
	if r.StatusCode != 200 || strings.TrimSpace(string(r.Body)) != `["USER","COACH"]` {
		t.Fatalf("%d %s", r.StatusCode, r.Body)
	}
	if got := strings.TrimSpace(string(empty.SignedIn(empty.Identity()).Get("/api/roux/roles/invitable").Body)); got != `[]` {
		t.Fatalf("no roles must be [], not null: %s", got)
	}
}
