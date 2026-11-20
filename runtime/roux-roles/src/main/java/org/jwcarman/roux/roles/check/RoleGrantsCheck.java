/*
 * Copyright © 2026 James Carman
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */
package org.jwcarman.roux.roles.check;

import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.TreeSet;

import org.jwcarman.roux.roles.RouxRoles;
import org.springframework.jdbc.core.simple.JdbcClient;

/**
 * The check an app's roles test runs after every migration: {@link RouxRoles#OWNER} holds exactly
 * the permission constants there are, and no role grants a permission no constant declares. A
 * forgotten grant or a typo in a changeset fails the build and names the permission.
 *
 * <pre>{@code
 * RoleGrantsCheck.check(jdbc, Permissions.allOf(AppPermissions.class, RouxThemePermissions.class,
 *     WhoAdminPermissions.class));
 * }</pre>
 */
public final class RoleGrantsCheck {

  private RoleGrantsCheck() {}

  /** A role's grant of a permission, as who-rbac's tables hold it. */
  record Grant(String role, String permission) {}

  /**
   * Checks the database's grants against the permission constants.
   *
   * @param jdbc reads who-rbac's tables
   * @param permissions every permission constant there is: {@code Permissions.allOf(...)}
   * @throws AssertionError naming every mismatch, one per line
   */
  public static void check(JdbcClient jdbc, List<String> permissions) {
    List<Grant> grants =
        jdbc.sql(
                "select r.name, p.permission from who_role r join who_role_permission p on"
                    + " p.role_id = r.id")
            .query((rs, _) -> new Grant(rs.getString(1), rs.getString(2)))
            .list();
    fail(problems(grants, permissions));
  }

  /** Every mismatch, sorted. */
  static List<String> problems(List<Grant> grants, List<String> permissions) {
    Set<String> known = Set.copyOf(permissions);
    Set<String> owner = new HashSet<>();
    TreeSet<String> problems = new TreeSet<>();
    for (Grant grant : grants) {
      boolean isOwner = RouxRoles.OWNER.equals(grant.role());
      if (isOwner) {
        owner.add(grant.permission());
      }
      if (!known.contains(grant.permission())) {
        problems.add(
            isOwner
                ? "OWNER holds " + grant.permission() + ", which no constant declares"
                : grant.role() + " grants " + grant.permission() + ", which no constant declares");
      }
    }
    for (String permission : permissions) {
      if (!owner.contains(permission)) {
        problems.add("OWNER lacks " + permission);
      }
    }
    return new ArrayList<>(problems);
  }

  /** Throws when there is any problem. */
  static void fail(List<String> problems) {
    if (!problems.isEmpty()) {
      throw new AssertionError(
          "The roles' grants do not match the permission constants:\n  "
              + String.join("\n  ", problems));
    }
  }
}
