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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.roles.Permissions;
import org.jwcarman.roux.roles.check.RoleGrantsCheck;
import org.jwcarman.roux.theme.RouxThemePermissions;
import org.jwcarman.roux.users.RouxUserPermissions;
import org.jwcarman.who.admin.WhoAdminPermissions;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

/** The check an app's roles test runs, against the grants every roux library's changelog makes. */
@SpringBootTest(classes = ContractTestApplication.class)
class RoleGrantsCheckContractTest {

  private static final List<String> EVERY_PERMISSION =
      Permissions.allOf(
          WhoAdminPermissions.class, RouxThemePermissions.class, RouxUserPermissions.class);

  @Autowired JdbcClient jdbc;

  @Test
  void rouxsGrantsMatchRouxsConstants() {
    assertThatCode(() -> RoleGrantsCheck.check(jdbc, EVERY_PERMISSION)).doesNotThrowAnyException();
  }

  @Test
  void aGrantNoConstantDeclaresFails() {
    List<String> declared = List.of("who.identities.read");

    assertThatThrownBy(() -> RoleGrantsCheck.check(jdbc, declared))
        .isInstanceOf(AssertionError.class)
        .hasMessageContaining("OWNER holds who.identities.manage, which no constant declares");
  }

  @Test
  void aTypoInAnAppsChangesetFails() {
    UUID typo = UUID.randomUUID();
    jdbc.sql("insert into who_role (id, name) values (?, 'TYPO')").param(typo).update();
    jdbc.sql("insert into who_role_permission (role_id, permission) values (?, 'members.raed')")
        .param(typo)
        .update();
    try {
      assertThatThrownBy(() -> RoleGrantsCheck.check(jdbc, EVERY_PERMISSION))
          .isInstanceOf(AssertionError.class)
          .hasMessageContaining("TYPO grants members.raed, which no constant declares");
    } finally {
      jdbc.sql("delete from who_role where id = ?").param(typo).update();
    }
  }
}
