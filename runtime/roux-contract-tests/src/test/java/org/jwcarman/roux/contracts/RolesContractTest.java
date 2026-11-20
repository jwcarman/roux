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

import static org.assertj.core.api.Assertions.assertThat;

import java.sql.Connection;
import java.util.List;

import javax.sql.DataSource;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.simple.JdbcClient;

import liquibase.Scope;
import liquibase.command.CommandScope;
import liquibase.command.core.UpdateCommandStep;
import liquibase.command.core.helpers.DbUrlConnectionArgumentsCommandStep;
import liquibase.database.Database;
import liquibase.database.DatabaseFactory;
import liquibase.database.jvm.JdbcConnection;
import liquibase.resource.ClassLoaderResourceAccessor;

/**
 * roux-roles' changelog as an application gets it from the starter: migratory runs it after
 * who-rbac's, so OWNER exists and holds who-admin's permissions before the app's own changelog.
 */
@SpringBootTest(classes = ContractTestApplication.class)
class RolesContractTest {

  private static final String CHANGELOG = "org/jwcarman/roux/roles/db/roux-roles-changelog.xml";

  @Autowired JdbcClient jdbc;
  @Autowired DataSource dataSource;

  private List<String> ownerPermissions() {
    return jdbc.sql(
            "select p.permission from who_role_permission p join who_role r on r.id = p.role_id"
                + " where r.name = 'OWNER' order by p.permission")
        .query(String.class)
        .list();
  }

  @Test
  void ownerHoldsWhoAdminPermissions() {
    assertThat(ownerPermissions()).contains("who.identities.read", "who.identities.manage");
  }

  @Test
  void ownerHoldsThemeManage() {
    assertThat(ownerPermissions()).contains("theme.manage");
  }

  @Test
  void onlyOwnerMayManageIdentities() {
    assertThat(
            jdbc.sql(
                    "select r.name from who_role r join who_role_permission p on p.role_id = r.id"
                        + " where p.permission = 'who.identities.manage'")
                .query(String.class)
                .list())
        .containsExactly("OWNER");
  }

  @Test
  void changelogMeetsAnExistingOwner() throws Exception {
    List<String> before = ownerPermissions();
    jdbc.sql("delete from databasechangelog where id like 'roux-roles-%'").update();

    try (Connection connection = dataSource.getConnection()) {
      Database database =
          DatabaseFactory.getInstance()
              .findCorrectDatabaseImplementation(new JdbcConnection(connection));
      Scope.child(
          Scope.Attr.resourceAccessor,
          new ClassLoaderResourceAccessor(),
          () ->
              new CommandScope(UpdateCommandStep.COMMAND_NAME)
                  .addArgumentValue(DbUrlConnectionArgumentsCommandStep.DATABASE_ARG, database)
                  .addArgumentValue(UpdateCommandStep.CHANGELOG_FILE_ARG, CHANGELOG)
                  .execute());
    }

    assertThat(
            jdbc.sql("select count(*) from who_role where name = 'OWNER'")
                .query(Long.class)
                .single())
        .isEqualTo(1L);
    assertThat(ownerPermissions()).isEqualTo(before);
    assertThat(
            jdbc.sql("select count(*) from databasechangelog where id = 'roux-roles-1'")
                .query(Long.class)
                .single())
        .isEqualTo(1L);
  }
}
