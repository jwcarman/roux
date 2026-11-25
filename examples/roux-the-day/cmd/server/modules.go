package main

import (
	"embed"
	"io/fs"
	"slices"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"

	"roux-the-day/internal/items"
)

// modules is the list of what this application is made of: the features it turns on, and its
// own. Add a line to turn a feature on. Each stock module reads its settings from the
// environment; the optional ones (passkeys, API keys, providers, bearer tokens) are nil when
// their setting is not there, and one that needs another takes it.
func modules(k *app.Kit) ([]app.Module, error) {
	mods := []app.Module{&appRoles{}}
	emails, err := fs.Sub(emailFiles, "emails")
	if err != nil {
		return nil, err
	}
	email, err := app.EmailLinkFromEnv(k.AppName, emails)
	if err != nil {
		return nil, err
	}
	members := app.UsersFromEnv(email)
	passkeys, err := app.PasskeysFromEnv(k.AppName, email)
	if err != nil {
		return nil, err
	}
	keys, err := app.APIKeysFromEnv(email)
	if err != nil {
		return nil, err
	}
	providers, err := app.OIDCFromEnv(email, members)
	if err != nil {
		return nil, err
	}
	tokens, err := app.JWTFromEnv(email)
	if err != nil {
		return nil, err
	}
	mods = append(mods, email, members, items.Module{})
	if passkeys != nil {
		mods = append(mods, passkeys)
	}
	if keys != nil {
		mods = append(mods, keys)
	}
	if providers != nil {
		mods = append(mods, providers)
	}
	if tokens != nil {
		mods = append(mods, tokens)
	}
	return mods, nil
}

// emailFiles is this application's wording for roux's emails (emails/README.md).
//
//go:embed emails
var emailFiles embed.FS

//go:embed migrations/*.sql
var appMigrations embed.FS

// appRoles is this application's own roles (migrations/): roux's modules grant their permissions to
// OWNER, and the application defines the rest.
type appRoles struct{}

func (*appRoles) Name() string { return "app-roles" }
func (*appRoles) Migrations() []pgdb.Migration {
	return []pgdb.Migration{{Name: "app-roles", FS: appMigrations, Dir: "migrations", After: []string{"roux-users"}}}
}

// permissions is every permission the application checks: roux's, then its own. Its permissions
// test writes them into the front end (frontend/src/permissions.gen.ts) and checks the grants.
func permissions() []string {
	return slices.Concat(app.RouxPermissions(), items.Permissions)
}
