package org.jwcarman.roux.examples.dojo.identity;

import static org.jwcarman.roux.roles.Permissions.allOf;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.check.RoleGrantsCheck;
import org.jwcarman.roux.test.AppTest;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The roles every changelog made grant exactly the permissions in {@link PermissionClasses}: a
 * forgotten grant or a typo in a changeset fails the build.
 */
@AppTest
class PermissionsTest {

  @Autowired JdbcClient jdbc;

  @Test
  void rolesGrantExactlyTheDeclaredPermissions() {
    RoleGrantsCheck.check(jdbc, allOf(PermissionClasses.ALL));
  }
}
