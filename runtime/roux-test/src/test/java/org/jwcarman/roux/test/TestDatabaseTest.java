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
package org.jwcarman.roux.test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.HashMap;
import java.util.Map;

import org.junit.jupiter.api.Test;
import org.springframework.context.support.GenericApplicationContext;

class TestDatabaseTest {

  private static final String URL = "ROUX_TEST_DATABASE_URL";
  private static final String USERNAME = "ROUX_TEST_DATABASE_USERNAME";
  private static final String PASSWORD = "ROUX_TEST_DATABASE_PASSWORD";

  @Test
  void environmentServerIsUsedWhenSet() {
    var server =
        TestDatabase.Server.fromEnvironment(
            Map.of(
                URL, "jdbc:postgresql://postgres:5432/dojo", USERNAME, "dojo", PASSWORD, "secret"));

    assertThat(server)
        .contains(
            new TestDatabase.Server("jdbc:postgresql://postgres:5432/dojo", "dojo", "secret"));
  }

  @Test
  void noEnvironmentMeansNoServer() {
    assertThat(TestDatabase.Server.fromEnvironment(Map.of())).isEmpty();
  }

  @Test
  void urlWithoutCredentialsIsAnError() {
    Map<String, String> env = Map.of(URL, "jdbc:postgresql://postgres:5432/dojo", PASSWORD, "x");

    assertThatThrownBy(() -> TestDatabase.Server.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(USERNAME);
  }

  @Test
  void eachCreateIsASeparateEmptyDatabase() throws SQLException {
    var first = TestDatabase.create();
    var second = TestDatabase.create();

    assertThat(first.url()).isNotEqualTo(second.url());
    try (Connection connection = open(first)) {
      connection.createStatement().execute("create table marker (id int)");
    }
    try (Connection connection = open(second);
        var tables =
            connection
                .createStatement()
                .executeQuery(
                    "select count(*) from information_schema.tables where table_name = 'marker'")) {
      tables.next();
      assertThat(tables.getInt(1)).isZero();
    }
  }

  private static Connection open(TestDatabase.Database database) throws SQLException {
    return DriverManager.getConnection(database.url(), database.username(), database.password());
  }

  @Test
  void theDatabaseReplacesTheServersAndKeepsItsParameters() {
    assertThat(
            TestDatabase.withDatabase("jdbc:postgresql://h:5432/postgres?ssl=false", "app_test_1"))
        .isEqualTo("jdbc:postgresql://h:5432/app_test_1?ssl=false");
    assertThat(TestDatabase.withDatabase("jdbc:postgresql://h:5432/postgres", "app_test_1"))
        .isEqualTo("jdbc:postgresql://h:5432/app_test_1");
  }

  @Test
  void registerPointsTheDatasourceAtANewDatabaseWithASmallPool() {
    Map<String, Object> properties = new HashMap<>();
    TestDatabase.register((name, value) -> properties.put(name, value.get()));

    assertThat((String) properties.get("spring.datasource.url")).contains("/app_test_");
    assertThat(properties)
        .containsKey("spring.datasource.username")
        .containsKey("spring.datasource.password")
        .containsEntry("spring.datasource.hikari.maximum-pool-size", "4");
  }

  @Test
  void aBlankUrlMeansNoServer() {
    assertThat(TestDatabase.Server.fromEnvironment(Map.of(URL, " "))).isEmpty();
  }

  @Test
  void aBlankPasswordIsAnError() {
    Map<String, String> env =
        Map.of(URL, "jdbc:postgresql://postgres:5432/dojo", USERNAME, "dojo", PASSWORD, " ");
    assertThatThrownBy(() -> TestDatabase.Server.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(PASSWORD);
  }

  @Test
  void aServerThatCannotBeReachedSaysWhichDatabaseFailed() {
    var nowhere = new TestDatabase.Server("jdbc:postgresql://localhost:1/postgres", "x", "y");

    assertThatThrownBy(() -> TestDatabase.create(nowhere))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageStartingWith("could not create test database app_test_")
        .hasCauseInstanceOf(SQLException.class);
  }

  @Test
  void theInitializerGivesTheContextANewDatabaseFirst() {
    try (GenericApplicationContext context = new GenericApplicationContext()) {
      new TestDatabase.Initializer().initialize(context);

      var sources = context.getEnvironment().getPropertySources();
      assertThat(sources.iterator().next().getName()).isEqualTo("testDatabase");
      assertThat(context.getEnvironment().getProperty("spring.datasource.url"))
          .contains("/app_test_");
    }
  }
}
