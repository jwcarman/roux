package app.identity;

import java.nio.file.Path;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.DisabledInNativeImage;
import org.jwcarman.roux.roles.check.PermissionsTypeScript;

/**
 * The frontend's list of permissions, {@code permissions.gen.ts}, is generated from {@link
 * PermissionClasses}: when it is stale this test rewrites it and fails, so run it again and commit
 * the file. A plain test, with no Spring and no database, so it runs without Docker. A build check,
 * not the app's behaviour, so not in a native image (nativeTest), where the permission classes'
 * fields are not there to read.
 */
@DisabledInNativeImage
class PermissionsListTest {

  @Test
  void frontendListIsCurrent() {
    PermissionsTypeScript.verify(Path.of("frontend/src/permissions.gen.ts"), PermissionClasses.ALL);
  }
}
