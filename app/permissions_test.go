package app_test

import (
	"testing"

	"github.com/jwcarman/roux/app"
	"github.com/jwcarman/roux/rouxtest"
	"github.com/jwcarman/roux/theme"
)

// Every permission roux's own migrations grant, and OWNER holding each.
func TestRouxPermissionsAreTheOnesItsMigrationsGrant(t *testing.T) {
	a := rouxtest.New(t, "app_permissions")
	a.Migrate(theme.Migration)
	rouxtest.CheckGrants(t, a.Pool, app.RouxPermissions()...)
}
