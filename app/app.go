// Package app assembles an application from modules. A module is one feature (email sign-in,
// passkeys, the users directory...): it says which migrations it owns, which sign-in method it
// contributes, how it mounts its routes and what it does at startup. main lists the modules the
// application wants and calls Assemble, so turning a feature on is adding a line, and no
// feature's wiring is spread across main.
//
// Dependencies between modules are plain Go: a module that needs another takes it as an
// argument (passkeys take the email module), so a missing dependency does not compile, and an
// application that leaves a feature out leaves out what needs it.
//
// Assemble runs in this order, whatever the order modules are listed in within each step:
//
//  1. every module's migrations run together (ordered by their own After/Before declarations);
//  2. every module's sign-in method is collected and who is registered with them, giving the Host;
//  3. each module is mounted, in the order listed (it can use Kit.Host), except that a module
//     that mounts first (the users module) is mounted before the others, so Kit.Organization and
//     Kit.ShellTheme are the application's own whatever the order of the list;
//  4. each module is started, in the order listed (the first owner, warm-ups).
package app

import (
	"context"
	"fmt"
	"log/slog"
	"slices"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
	"github.com/jackc/pgx/v5/pgxpool"

	"github.com/jwcarman/roux/api"
	"github.com/jwcarman/roux/authn"
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/organization"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/spa"
)

// Module is one feature of an application. It may also implement any of Migrator, SignInProvider,
// Mounter and Starter.
type Module interface {
	// Name identifies the module in errors and logs; names must be unique.
	Name() string
}

// Migrator is a module that owns database tables.
type Migrator interface{ Migrations() []pgdb.Migration }

// SignInProvider is a module that contributes a way of signing in (or authenticating a request).
type SignInProvider interface{ SignIn() authn.Method }

// Mounter is a module that registers routes. Kit.Host is set.
type Mounter interface {
	Mount(ctx context.Context, k *Kit) error
}

// mountsFirst is a module whose Mount sets what other modules read from the kit while they mount
// (the users module sets Kit.Organization and Kit.ShellTheme). Assemble mounts it before the
// others, so the order of the list cannot hand a module the defaults.
type mountsFirst interface{ mountsFirst() }

// Starter is a module that has work to do once everything is mounted.
type Starter interface {
	Start(ctx context.Context, k *Kit) error
}

// Drainer is a module with work in flight (an email accepted a moment ago) that should finish
// before the process exits.
type Drainer interface{ Drain() }

// Kit is what modules build on.
type Kit struct {
	Mux *api.Mux
	// Pool is the database; nil when the application runs without one.
	Pool    *pgxpool.Pool
	AppName string
	// SecureCookies marks every cookie Secure whatever the request looks like (see authn.Config).
	SecureCookies bool
	// Host guards routes (Guard, Open) and serves sign-in's endpoints. Set by Assemble
	// before any module is mounted.
	Host *authn.Host
	// DefaultTheme is the theme until the owner chooses one: Config.Look under AppName. Run sets
	// it; empty, it is spa.Clean.
	DefaultTheme spa.Theme
	// ShellTheme is the theme the page carries: the owner's saved one once the theme module is
	// mounted, else DefaultTheme.
	ShellTheme func(ctx context.Context) (spa.Theme, error)
	// Organization is what the page tells the browser about the organization (zone, locale,
	// today, currency): pass it to spa.Config.Context. The users module sets it from ORG_*
	// before any other module mounts; an application without the users module has UTC and en-US.
	Organization func() organization.Context

	modules []Module
	routes  []guardedRoute // what Handle mounted, checked against the grants once every module has
}

// guardedRoute is a route Kit.Handle mounted and the permission it needs.
type guardedRoute struct{ pattern, permission string }

// Handle registers one of the application's routes for callers holding permission: an unsafe
// request must carry the CSRF token (403), and every request must come from someone signed in
// (401) who holds the permission (403). It is Mux.Handle and Host.Guard in one call,
// so a route cannot be mounted half guarded. An empty permission panics at startup: a route
// for anyone signed in is HandleSignedIn, and one for anybody is HandlePublic. Assemble refuses
// a permission no role holds once the migrations have run: a misspelling would answer 403 to
// everyone.
func (k *Kit) Handle(pattern, permission string, fn api.HandlerFunc) {
	if permission == "" {
		panic(fmt.Sprintf("app: route %q names no permission: use HandleSignedIn or HandlePublic", pattern))
	}
	k.routes = append(k.routes, guardedRoute{pattern, permission})
	k.Mux.HandleGuarded(pattern, k.Host.Guard(permission, fn))
}

// checkRoutes refuses a route whose permission no role holds. OWNER holds every permission the
// app declares (rouxtest.CheckGrants), so such a permission is misspelled or never granted.
func (k *Kit) checkRoutes(ctx context.Context) error {
	if k.Pool == nil || len(k.routes) == 0 {
		return nil
	}
	rows, err := k.Pool.Query(ctx, `select distinct permission from roux_role_permission`)
	if err != nil {
		return err
	}
	held, err := pgx.CollectRows(rows, pgx.RowTo[string])
	if err != nil {
		return err
	}
	var bad []string
	for _, r := range k.routes {
		if !slices.Contains(held, r.permission) {
			bad = append(bad, fmt.Sprintf("%s needs %q", r.pattern, r.permission))
		}
	}
	if len(bad) > 0 {
		return fmt.Errorf("app: no role holds the permission of %s: check the spelling against the "+
			"feature's permission constants, and grant it to OWNER in the migration that adds it",
			strings.Join(bad, "; "))
	}
	return nil
}

// HandleSignedIn registers a route for anyone signed in, whatever they may do (their own
// settings, say). CSRF-checked like every route.
func (k *Kit) HandleSignedIn(pattern string, fn api.HandlerFunc) {
	k.Mux.HandleGuarded(pattern, k.Host.Guard("", fn))
}

// HandlePublic registers a route anybody may call, signed in or not. CSRF-checked like every
// route; authn.PrincipalFrom finds a signed-in caller and is nil for anyone else.
func (k *Kit) HandlePublic(pattern string, fn api.HandlerFunc) {
	k.Mux.HandleGuarded(pattern, k.Host.Open(fn))
}

// Drain waits for the modules' work in flight. Call it after the server has stopped taking requests.
func (k *Kit) Drain() {
	for _, m := range k.modules {
		if d, ok := m.(Drainer); ok {
			d.Drain()
		}
	}
}

// coreMigrations are sign-in's and permissions' own tables, not any module's.
var coreMigrations = []pgdb.Migration{authn.Migration, authz.Migration}

// Assemble migrates the database, registers sign-in with the modules' methods, then mounts
// and starts the modules. A failure names the module.
func Assemble(ctx context.Context, k *Kit, modules ...Module) error {
	mods, err := distinct(modules)
	if err != nil {
		return err
	}
	k.modules = mods
	k.defaults()

	methods, err := migrate(ctx, k, mods)
	if err != nil {
		return err
	}
	host, err := authn.Register(k.Mux, authn.Config{
		Pool: k.Pool, Permissions: authz.Service{Pool: k.Pool}.PermissionsOf, SecureCookies: k.SecureCookies,
	}, methods...)
	if err != nil {
		return err
	}
	k.Host = host

	if err := mountAll(ctx, k, mods); err != nil {
		return err
	}
	if err := k.checkRoutes(ctx); err != nil {
		return err
	}
	// Mux.Handle mounts a route as it is; one an app meant to guard is open to anybody.
	for _, route := range k.Mux.Unguarded() {
		slog.WarnContext(ctx, "route has no guard: anyone may call it, with no CSRF check; mount it with kit.Handle, kit.HandleSignedIn or kit.HandlePublic", "route", route)
	}
	if err := startAll(ctx, k, mods); err != nil {
		return err
	}
	names := make([]string, len(mods))
	for i, m := range mods {
		names[i] = m.Name()
	}
	slog.InfoContext(ctx, "application assembled", "modules", strings.Join(names, ","))
	return nil
}

// distinct is the modules listed, without the nil ones (features turned off); a name listed
// twice is an error.
func distinct(modules []Module) ([]Module, error) {
	seen := map[string]bool{}
	var mods []Module
	for _, m := range modules {
		if m == nil {
			continue
		}
		if seen[m.Name()] {
			return nil, fmt.Errorf("app: module %q is listed twice", m.Name())
		}
		seen[m.Name()] = true
		mods = append(mods, m)
	}
	return mods, nil
}

// defaults fills what the page needs until a module sets it: UTC and en-US, and the default theme.
func (k *Kit) defaults() {
	if k.DefaultTheme == (spa.Theme{}) {
		k.DefaultTheme = spa.Clean.Theme(k.AppName)
	}
	if k.Organization == nil {
		k.Organization = func() organization.Context { return organization.NewContext(time.Now(), time.UTC, "en-US") }
	}
	if k.ShellTheme == nil {
		def := k.DefaultTheme
		k.ShellTheme = func(context.Context) (spa.Theme, error) { return def, nil }
	}
}

// migrate applies roux's and the modules' migrations and gathers their sign-in methods. With no
// database there are neither, and a module with migrations is refused: its data has nowhere to go.
func migrate(ctx context.Context, k *Kit, mods []Module) ([]authn.Method, error) {
	if k.Pool == nil {
		for _, m := range mods {
			if _, ok := m.(Migrator); ok {
				return nil, fmt.Errorf("DATABASE_URL is required: the %s module keeps its data in PostgreSQL "+
					"(postgres://app:app@localhost:5432/app from compose.yaml; make dev sets it)", m.Name())
			}
		}
		return nil, nil
	}
	migrations := slices.Clone(coreMigrations)
	var methods []authn.Method
	for _, m := range mods {
		if mg, ok := m.(Migrator); ok {
			migrations = append(migrations, mg.Migrations()...)
		}
		if sp, ok := m.(SignInProvider); ok {
			methods = append(methods, sp.SignIn())
		}
	}
	if err := pgdb.Migrate(ctx, k.Pool, dedupe(migrations)...); err != nil {
		return nil, fmt.Errorf("app: migrating: %w", err)
	}
	return methods, nil
}

func mountAll(ctx context.Context, k *Kit, mods []Module) error {
	first := func(m Module) bool { _, ok := m.(mountsFirst); return ok }
	ordered := slices.Clone(mods)
	slices.SortStableFunc(ordered, func(a, b Module) int {
		switch {
		case first(a) && !first(b):
			return -1
		case first(b) && !first(a):
			return 1
		}
		return 0
	})
	for _, m := range ordered {
		if mt, ok := m.(Mounter); ok {
			if err := mt.Mount(ctx, k); err != nil {
				return fmt.Errorf("app: mounting %s: %w", m.Name(), err)
			}
		}
		describe(ctx, m)
	}
	return nil
}

func startAll(ctx context.Context, k *Kit, mods []Module) error {
	for _, m := range mods {
		if st, ok := m.(Starter); ok {
			if err := st.Start(ctx, k); err != nil {
				return fmt.Errorf("app: starting %s: %w", m.Name(), err)
			}
		}
	}
	return nil
}

// describe logs one module as it comes up: what it brought, so the log says what is on.
func describe(ctx context.Context, m Module) {
	migrations := 0
	if mg, ok := m.(Migrator); ok {
		migrations = len(mg.Migrations())
	}
	_, signIn := m.(SignInProvider)
	slog.InfoContext(ctx, "module enabled", "name", m.Name(), "migrations", migrations, "sign_in", signIn)
}

// dedupe keeps the first migration of each name: two modules may depend on the same schema.
func dedupe(in []pgdb.Migration) []pgdb.Migration {
	seen := map[string]bool{}
	var out []pgdb.Migration
	for _, m := range in {
		if !seen[m.Name] {
			seen[m.Name] = true
			out = append(out, m)
		}
	}
	return out
}
