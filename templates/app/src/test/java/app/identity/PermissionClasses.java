package app.identity;

import org.jwcarman.roux.theme.RouxThemePermissions;
import org.jwcarman.roux.users.RouxUserPermissions;
import org.jwcarman.who.admin.WhoAdminPermissions;

/**
 * Every class of permission constants, in one place: {@link PermissionsTest} checks the roles grant
 * exactly these, and {@link PermissionsListTest} writes the frontend's list from them. The app's
 * first permission starts {@code identity/Permissions} (a {@code public static final String} per
 * permission), and that class is added here; roux refuses a class that declares none, so it is not
 * here before then.
 */
final class PermissionClasses {

  static final Class<?>[] ALL = {
    RouxThemePermissions.class, RouxUserPermissions.class, WhoAdminPermissions.class
  };

  private PermissionClasses() {}
}
