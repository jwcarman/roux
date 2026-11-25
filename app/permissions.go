package app

import (
	"github.com/jwcarman/roux/authz"
	"github.com/jwcarman/roux/theme"
	"github.com/jwcarman/roux/users"
)

// RouxPermissions is every permission roux's own modules check: an application's permissions are
// these followed by its own, for rouxtest.PermissionsFile and rouxtest.CheckGrants.
func RouxPermissions() []string {
	return []string{
		theme.ThemeManage,
		users.UsersRead, users.UsersInvite, users.UsersManage, users.UsersOwners,
		authz.Admin,
	}
}
