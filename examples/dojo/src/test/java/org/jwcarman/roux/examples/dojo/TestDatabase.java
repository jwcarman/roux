package org.jwcarman.roux.examples.dojo;

import java.security.SecureRandom;
import java.sql.Connection;
import java.sql.DriverManager;
import java.sql.SQLException;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;

import org.springframework.context.ApplicationContextInitializer;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.MapPropertySource;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.testcontainers.postgresql.PostgreSQLContainer;

/**
 * A fresh, empty database for each application context (or test class that asks for one), on one
 * Postgres server shared by the whole run.
 *
 * <p>The server is a service when {@code DOJO_TEST_DATABASE_URL}, {@code
 * DOJO_TEST_DATABASE_USERNAME} and {@code DOJO_TEST_DATABASE_PASSWORD} are set (containers that
 * have no Docker do this); otherwise it is one Testcontainers Postgres per JVM, started on first
 * use.
 */
public final class TestDatabase {

  static final String URL_VARIABLE = "DOJO_TEST_DATABASE_URL";
  static final String USERNAME_VARIABLE = "DOJO_TEST_DATABASE_USERNAME";
  static final String PASSWORD_VARIABLE = "DOJO_TEST_DATABASE_PASSWORD";

  private static final SecureRandom RANDOM = new SecureRandom();

  private TestDatabase() {}

  /** A database on the server: its JDBC URL and the credentials to open it. */
  public record Database(String url, String username, String password) {}

  /** The Postgres server the databases are created on. */
  public record Server(String url, String username, String password) {

    /** The server named by the environment, if any; the credentials are required with the URL. */
    public static Optional<Server> fromEnvironment(Map<String, String> env) {
      String url = env.get(URL_VARIABLE);
      if (url == null || url.isBlank()) {
        return Optional.empty();
      }
      return Optional.of(
          new Server(url, required(env, USERNAME_VARIABLE), required(env, PASSWORD_VARIABLE)));
    }

    private static String required(Map<String, String> env, String name) {
      String value = env.get(name);
      if (value == null || value.isBlank()) {
        throw new IllegalStateException(name + " must be set when " + URL_VARIABLE + " is set");
      }
      return value;
    }
  }

  /** Creates an empty database named {@code app_test_<12 hex>} on the shared server. */
  public static Database create() {
    Server server = ServerHolder.SERVER;
    String name = "app_test_" + randomHex();
    try (Connection admin =
            DriverManager.getConnection(server.url(), server.username(), server.password());
        var statement = admin.createStatement()) {
      // The name is generated here, never taken from input.
      statement.execute("create database " + name);
      return new Database(withDatabase(server.url(), name), server.username(), server.password());
    } catch (SQLException e) {
      throw new IllegalStateException("could not create test database " + name, e);
    }
  }

  /** Points {@code spring.datasource.*} at a new database. */
  public static void register(DynamicPropertyRegistry registry) {
    register(registry, create());
  }

  /** Points {@code spring.datasource.*} at {@code database}, for classes that also open it. */
  public static void register(DynamicPropertyRegistry registry, Database database) {
    properties(database).forEach((name, value) -> registry.add(name, () -> value));
  }

  /** The {@code spring.datasource.*} properties that point the app at {@code database}. */
  static Map<String, Object> properties(Database database) {
    return Map.of(
        "spring.datasource.url", database.url(),
        "spring.datasource.username", database.username(),
        "spring.datasource.password", database.password(),
        // Spring keeps every cached context open until the JVM exits; with Hikari's default of 10
        // idle connections each, a shared server runs out of connections.
        "spring.datasource.hikari.maximum-pool-size", "4",
        "spring.datasource.hikari.minimum-idle", "0");
  }

  /**
   * Gives each application context a new database: test classes that share a context share it.
   * {@link AppTest} uses it.
   */
  public static final class Initializer
      implements ApplicationContextInitializer<ConfigurableApplicationContext> {

    @Override
    public void initialize(ConfigurableApplicationContext context) {
      context
          .getEnvironment()
          .getPropertySources()
          .addFirst(new MapPropertySource("testDatabase", properties(create())));
    }
  }

  private static String randomHex() {
    byte[] bytes = new byte[6];
    RANDOM.nextBytes(bytes);
    return HexFormat.of().formatHex(bytes);
  }

  /** Replaces the database in {@code jdbc:postgresql://host:port/db[?params]}. */
  private static String withDatabase(String url, String name) {
    int query = url.indexOf('?');
    String base = query < 0 ? url : url.substring(0, query);
    String params = query < 0 ? "" : url.substring(query);
    return base.substring(0, base.lastIndexOf('/') + 1) + name + params;
  }

  /** Initialized on first use: the environment's server, or a container that Ryuk stops. */
  private static final class ServerHolder {
    static final Server SERVER =
        Server.fromEnvironment(System.getenv()).orElseGet(ServerHolder::startContainer);

    private static Server startContainer() {
      PostgreSQLContainer postgres = new PostgreSQLContainer("postgres:16");
      postgres.start();
      return new Server(postgres.getJdbcUrl(), postgres.getUsername(), postgres.getPassword());
    }
  }
}
