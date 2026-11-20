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

import java.time.Duration;
import java.util.Map;
import java.util.Optional;

import org.testcontainers.containers.GenericContainer;
import org.testcontainers.containers.wait.strategy.Wait;

/**
 * The Mailpit the tests send mail to: a service when {@code ROUX_TEST_MAIL_SMTP_HOST}, {@code
 * ROUX_TEST_MAIL_SMTP_PORT} and {@code ROUX_TEST_MAIL_API_URL} are set (containers that have no
 * Docker); otherwise one Testcontainers Mailpit per JVM, started on first use.
 */
public final class TestMail {

  static final String HOST_VARIABLE = "ROUX_TEST_MAIL_SMTP_HOST";
  static final String PORT_VARIABLE = "ROUX_TEST_MAIL_SMTP_PORT";
  static final String API_VARIABLE = "ROUX_TEST_MAIL_API_URL";

  /** The Mailpit image, pinned; a service must run the same one. */
  static final String IMAGE = "axllent/mailpit:v1.33.1";

  private TestMail() {}

  /**
   * Where to send mail and where to read it back.
   *
   * @param smtpHost the SMTP host
   * @param smtpPort the SMTP port
   * @param apiUrl Mailpit's HTTP API
   */
  public record Mail(String smtpHost, int smtpPort, String apiUrl) {}

  /**
   * The Mailpit named by the environment, if any; the port and API URL are required with it.
   *
   * @param env the environment
   * @return the Mailpit, or empty when the host is not set
   * @throws IllegalStateException when the host is set without a port or API URL, or the port is
   *     not a number
   */
  public static Optional<Mail> fromEnvironment(Map<String, String> env) {
    String host = env.get(HOST_VARIABLE);
    if (host == null || host.isBlank()) {
      return Optional.empty();
    }
    return Optional.of(
        new Mail(host, port(required(env, PORT_VARIABLE)), required(env, API_VARIABLE)));
  }

  /**
   * The environment's Mailpit, or the per-JVM container.
   *
   * @return where to send and read mail
   */
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

  /**
   * Initialized on first use: the environment's Mailpit, or a container run until the JVM exits.
   */
  private static final class Holder {
    static final Mail MAIL = fromEnvironment(System.getenv()).orElseGet(Holder::startContainer);

    private static Mail startContainer() {
      GenericContainer<?> mailpit =
          Containers.started(
              new GenericContainer<>(IMAGE)
                  .withExposedPorts(1025, 8025)
                  .waitingFor(
                      Wait.forHttp("/api/v1/info")
                          .forPort(8025)
                          .withStartupTimeout(Duration.ofMinutes(2))));
      return new Mail(
          mailpit.getHost(),
          mailpit.getMappedPort(1025),
          "http://" + mailpit.getHost() + ":" + mailpit.getMappedPort(8025));
    }
  }
}
