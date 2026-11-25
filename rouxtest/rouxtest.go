// Package rouxtest is for an application's own tests: its features over a fresh database schema
// with roux's tables, a team of people in roles, a clock the test moves, and browsers signed in
// as any of them. It builds on authntest (whose Env it embeds: Pool, Mux, Host, Clock,
// SignedIn, Browser), adding what every app needs and would otherwise write itself.
//
//	a := rouxtest.New(t, "items", items.Module{}.Migrations()...)
//	a.Role("USER", items.ItemsRead, items.ItemsWrite)
//	items.Register(a.Kit(), items.Service{Pool: a.Pool, Clock: a.Clock.Now})
//	a.Serve()
//	ada := a.Person("Ada Lovelace", "USER")
//	a.SignedIn(ada).Post("/api/items", body).Want(t, 201, "Ada adds an item")
package rouxtest

import (
	"context"
	"testing"
	"time"

	"github.com/google/uuid"

	"github.com/jwcarman/roux/activity"
	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authn/authntest"
	"github.com/jwcarman/roux/authn/emaillink"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/users"
)

// App is an application's features under test. The clock starts at 2026-11-24 12:00 UTC.
type App struct {
	*authntest.Env
}

// New migrates roux's tables (identities, roles, sign-in by email, users, the activity log) and the
// application's migrations into a fresh schema named schema. Add roles, register the routes on
// Kit(), then call Serve.
func New(t *testing.T, schema string, migrations ...pgdb.Migration) *App {
	t.Helper()
	all := append([]pgdb.Migration{activity.Migration, emaillink.Migration, users.Migration}, migrations...)
	return &App{Env: authntest.New(t, schema, all...)}
}

// Kit is what an application's modules mount their routes on (Kit.Handle and the rest).
func (a *App) Kit() *app.Kit {
	return &app.Kit{Mux: a.Mux, Host: a.Host, Pool: a.Pool, AppName: "Test App"}
}

// Role makes a role, if there is none of that name, and grants it the permissions. OWNER exists
// already and holds every permission.
func (a *App) Role(name string, permissions ...string) {
	a.T.Helper()
	ctx := context.Background()
	if _, err := a.Pool.Exec(ctx, `insert into roux_role (id, name) values ($1, $2) on conflict (name) do nothing`, uuid.New(), name); err != nil {
		a.T.Fatal(err)
	}
	for _, p := range permissions {
		if _, err := a.Pool.Exec(ctx, `
			insert into roux_role_permission (role_id, permission)
			select id, $2 from roux_role where name = $1
			on conflict do nothing`, name, p); err != nil {
			a.T.Fatal(err)
		}
	}
}

// Person adds an active member of the team, named name, in the role, and returns their id. They
// have no email address: sign them in with SignedIn.
func (a *App) Person(name, role string) uuid.UUID {
	a.T.Helper()
	ctx := context.Background()
	id, err := authn.CreateIdentity(ctx, a.Pool, a.Clock.Now())
	if err != nil {
		a.T.Fatal(err)
	}
	if _, err := a.Pool.Exec(ctx, `insert into roux_user (id, version, display_name) values ($1, 0, $2)`, id, name); err != nil {
		a.T.Fatal(err)
	}
	r, found, err := authz.FindRole(ctx, a.Pool, role)
	if err != nil || !found {
		a.T.Fatalf("rouxtest: no role %s (make it with Role): %v", role, err)
	}
	if err := authz.Assign(ctx, a.Pool, id, r.ID); err != nil {
		a.T.Fatal(err)
	}
	return id
}

// Deactivate deactivates a person, as an owner would: their sessions end.
func (a *App) Deactivate(id uuid.UUID) {
	a.T.Helper()
	ctx := context.Background()
	if _, err := a.Pool.Exec(ctx, `update roux_identity set status = 'DEACTIVATED' where id = $1`, id); err != nil {
		a.T.Fatal(err)
	}
	if err := authn.EndSessions(ctx, a.Pool, id, a.Clock.Now()); err != nil {
		a.T.Fatal(err)
	}
}

// At moves the clock to a moment, forward or back.
func (a *App) At(moment time.Time) {
	a.Clock.Advance(moment.Sub(a.Clock.Now()))
}

// Serve starts serving what is registered.
func (a *App) Serve() *App {
	a.Env.Serve()
	return a
}

// Migrate applies more migrations: an application's own that grant to roles a test makes first.
func (a *App) Migrate(migrations ...pgdb.Migration) {
	a.T.Helper()
	if err := pgdb.Migrate(context.Background(), a.Pool, migrations...); err != nil {
		a.T.Fatal(err)
	}
}
