package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.Map;

import org.junit.jupiter.api.Test;

class TestDatabaseTest {

  private static final String URL = "DOJO_TEST_DATABASE_URL";
  private static final String USERNAME = "DOJO_TEST_DATABASE_USERNAME";
  private static final String PASSWORD = "DOJO_TEST_DATABASE_PASSWORD";

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
}
