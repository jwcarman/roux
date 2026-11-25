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
//  3. each module is mounted, in the order listed (it can use Kit.Host);
//  4. each module is started, in the order listed (the first owner, warm-ups).
package app

import (
	"context"
	"fmt"
	"log/slog"
	"strings"
	"time"

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
	// Host guards routes (Guard, Open, HandleSigned) and sets who's endpoints. Set by Assemble
	// before any module is mounted.
	Host *authn.Host
	// ShellTheme is the theme the page carries: the owner's saved one once the theme module is
	// mounted, else the stock one.
	ShellTheme func(ctx context.Context) (spa.Theme, error)
	// Organization is what the page tells the browser about the organization (zone, locale,
	// today, currency): pass it to spa.Config.Context. The users module sets it from ORG_*;
	// until then it is UTC and en-US.
	Organization func() organization.Context

	modules []Module
}

// Drain waits for the modules' work in flight. Call it after the server has stopped taking requests.
func (k *Kit) Drain() {
	for _, m := range k.modules {
		if d, ok := m.(Drainer); ok {
			d.Drain()
		}
	}
}

// coreMigrations belong to who itself, not to any module.
var coreMigrations = []pgdb.Migration{authn.Migration, authz.Migration}

// Assemble migrates the database, registers who with the modules' sign-in methods, then mounts
// and starts the modules. A failure names the module.
func Assemble(ctx context.Context, k *Kit, modules ...Module) error {
	seen := map[string]bool{}
	var mods []Module
	for _, m := range modules {
		if m == nil {
			continue
		}
		if seen[m.Name()] {
			return fmt.Errorf("app: module %q is listed twice", m.Name())
		}
		seen[m.Name()] = true
		mods = append(mods, m)
	}
	k.modules = mods
	if k.Organization == nil {
		k.Organization = func() organization.Context { return organization.NewContext(time.Now(), time.UTC, "en-US") }
	}
	if k.ShellTheme == nil {
		name := k.AppName
		k.ShellTheme = func(context.Context) (spa.Theme, error) { return spa.StockTheme(name), nil }
	}

	var migrations []pgdb.Migration
	var methods []authn.Method
	if k.Pool != nil {
		migrations = append(migrations, coreMigrations...)
		for _, m := range mods {
			if mg, ok := m.(Migrator); ok {
				migrations = append(migrations, mg.Migrations()...)
			}
			if sp, ok := m.(SignInProvider); ok {
				methods = append(methods, sp.SignIn())
			}
		}
		if err := pgdb.Migrate(ctx, k.Pool, dedupe(migrations)...); err != nil {
			return fmt.Errorf("app: migrating: %w", err)
		}
	}

	host, err := authn.Register(k.Mux, authn.Config{
		Pool: k.Pool, Permissions: authz.Service{Pool: k.Pool}.PermissionsOf, SecureCookies: k.SecureCookies,
	}, methods...)
	if err != nil {
		return err
	}
	k.Host = host

	for _, m := range mods {
		if mt, ok := m.(Mounter); ok {
			if err := mt.Mount(ctx, k); err != nil {
				return fmt.Errorf("app: mounting %s: %w", m.Name(), err)
			}
		}
		describe(ctx, m)
	}
	for _, m := range mods {
		if st, ok := m.(Starter); ok {
			if err := st.Start(ctx, k); err != nil {
				return fmt.Errorf("app: starting %s: %w", m.Name(), err)
			}
		}
	}
	names := make([]string, len(mods))
	for i, m := range mods {
		names[i] = m.Name()
	}
	slog.InfoContext(ctx, "application assembled", "modules", strings.Join(names, ","))
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
