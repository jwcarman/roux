package main

import (
	"strings"
	"testing"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/pgdb"
	"github.com/jwcarman/roux/rouxtest"
)

// The front end's list of permissions is the server's: a permission added here is rewritten into
// frontend/src/permissions.gen.ts, and this test fails once so the change is committed.
func TestTheFrontEndListsEveryPermission(t *testing.T) {
	rouxtest.PermissionsFile(t, "../../frontend/src/permissions.gen.ts", permissions()...)
}

// After every migration the app runs, OWNER holds every permission and no role grants one that
// is not declared: a forgotten grant or a typo in a migration fails here, naming it.
func TestEveryGrantIsADeclaredPermissionAndOwnerHoldsThemAll(t *testing.T) {
	t.Setenv("CODE_SECRET", strings.Repeat("s", 40))
	t.Setenv("PUBLIC_URL", "http://localhost:8080")
	a := rouxtest.New(t, "app_grants")
	mods, err := modules(a.Kit())
	if err != nil {
		t.Fatal(err)
	}
	var migrations []pgdb.Migration
	for _, m := range mods {
		if mg, ok := m.(app.Migrator); ok {
			migrations = append(migrations, mg.Migrations()...)
		}
	}
	a.Migrate(migrations...)
	rouxtest.CheckGrants(t, a.Pool, permissions()...)
}
