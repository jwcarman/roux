package org.jwcarman.roux.examples.dojo.identity;

import org.jwcarman.roux.theme.RouxThemePermissions;
import org.jwcarman.roux.users.RouxUserPermissions;
import org.jwcarman.who.admin.WhoAdminPermissions;

/**
 * Every class of permission constants, in one place: {@link PermissionsTest} checks the roles grant
 * exactly these, and {@link PermissionsListTest} writes the frontend's list from them.
 */
final class PermissionClasses {

  static final Class<?>[] ALL = {
    Permissions.class,
    RouxThemePermissions.class,
    RouxUserPermissions.class,
    WhoAdminPermissions.class
  };

  private PermissionClasses() {}
}
