package org.jwcarman.roux.examples.dojo.identity;

import static org.jwcarman.roux.roles.Permissions.allOf;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.check.PermissionsTypeScript;
import org.jwcarman.roux.roles.check.RoleGrantsCheck;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.theme.RouxThemePermissions;
import org.jwcarman.who.admin.WhoAdminPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * Every permission there is, in one place: the roles every changelog made grant exactly these, and
 * the frontend's list is generated from them. A forgotten grant, a typo in a changeset or a stale
 * {@code permissions.gen.ts} fails the build.
 */
@AppTest
class PermissionsTest {

  private static final Class<?>[] ALL = {
    Permissions.class, RouxThemePermissions.class, WhoAdminPermissions.class
  };

  @Autowired JdbcClient jdbc;

  @Test
  void rolesGrantExactlyTheDeclaredPermissions() {
    RoleGrantsCheck.check(jdbc, allOf(ALL));
  }

  @Test
  void frontendListIsCurrent() {
    PermissionsTypeScript.verify(Path.of("frontend/src/permissions.gen.ts"), ALL);
  }
}
