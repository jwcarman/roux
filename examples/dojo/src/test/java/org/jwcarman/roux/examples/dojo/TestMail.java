package org.jwcarman.roux.examples.dojo;

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

/**
 * The Mailpit the tests send mail to: a service when {@code DOJO_TEST_MAIL_SMTP_HOST}, {@code
 * DOJO_TEST_MAIL_SMTP_PORT} and {@code DOJO_TEST_MAIL_API_URL} are set (containers that have no
 * Docker); otherwise one Testcontainers Mailpit per JVM, started on first use.
 */
public final class TestMail {

  static final String HOST_VARIABLE = "DOJO_TEST_MAIL_SMTP_HOST";
  static final String PORT_VARIABLE = "DOJO_TEST_MAIL_SMTP_PORT";
  static final String API_VARIABLE = "DOJO_TEST_MAIL_API_URL";

  /** The Mailpit image, pinned; a service must run the same one. */
  static final String IMAGE = "axllent/mailpit:v1.33.1";

  private TestMail() {}

  /** Where to send mail and where to read it back. */
  public record Mail(String smtpHost, int smtpPort, String apiUrl) {}

  /** The Mailpit named by the environment, if any; the port and API URL are required with it. */
  public static Optional<Mail> fromEnvironment(Map<String, String> env) {
    String host = env.get(HOST_VARIABLE);
    if (host == null || host.isBlank()) {
      return Optional.empty();
    }
    return Optional.of(
        new Mail(host, port(required(env, PORT_VARIABLE)), required(env, API_VARIABLE)));
  }

  /** The environment's Mailpit, or the per-JVM container. */
  public static Mail get() {
    return Holder.MAIL;
  }

  private static String required(Map<String, String> env, String name) {
    String value = env.get(name);
    if (value == null || value.isBlank()) {
      throw new IllegalStateException(name + " must be set when " + HOST_VARIABLE + " is set");
    }
    return value;
  }

  private static int port(String value) {
    try {
      return Integer.parseInt(value.trim());
    } catch (NumberFormatException e) {
      throw new IllegalStateException(PORT_VARIABLE + " must be a number, not " + value, e);
    }
  }

  /** Initialized on first use; the container, if any, is stopped by Testcontainers' Ryuk. */
  private static final class Holder {
    static final Mail MAIL = fromEnvironment(System.getenv()).orElseGet(Holder::startContainer);

    private static Mail startContainer() {
      GenericContainer<?> mailpit =
          new GenericContainer<>(IMAGE)
              .withExposedPorts(1025, 8025)
              .waitingFor(
                  Wait.forHttp("/api/v1/info")
                      .forPort(8025)
                      .withStartupTimeout(Duration.ofMinutes(2)));
      mailpit.start();
      return new Mail(
          mailpit.getHost(),
          mailpit.getMappedPort(1025),
          "http://" + mailpit.getHost() + ":" + mailpit.getMappedPort(8025));
    }
  }
}
