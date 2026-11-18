package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.File;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.net.ServerSocket;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.file.Files;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.springframework.boot.SpringApplication;
import org.springframework.context.ConfigurableApplicationContext;

/**
 * The app in a browser: a database from {@link TestDatabase}, Mailpit from {@link TestMail}, the
 * app on a free port, and Playwright (in {@code e2e/}) signing in by email link and passkey,
 * inviting a member and revoking a passkey.
 *
 * <p>The app gets the same command-line arguments every way it runs:
 *
 * <ul>
 *   <li>by default it starts in this process;
 *   <li>with {@code -Dapp.binary=<path>} (the {@code native-e2e} profile) it starts that native
 *       binary as a process;
 *   <li>with {@code -Dapp.trace-jar=<path>} (the {@code native-trace} profile) it starts that jar
 *       on this JVM's {@code java} under GraalVM's tracing agent, which merges the reflection,
 *       resource and proxy metadata the suite exercises into {@code target/native-trace}.
 * </ul>
 *
 * <p>A separate process logs to {@code target/app.log}. The suite gets the app's and Mailpit's URLs
 * from the environment, so it runs unchanged against each.
 */
class E2eIT {

  static final String OWNER_EMAIL = "owner@dojo.test";
  static final String OWNER_NAME = "Olive Owner";

  static final File LOG = new File("target/playwright.log");

  static final File APP_LOG = new File("target/app.log");

  static final File TRACE_DIR = new File("target/native-trace");

  static final TestDatabase.Database DATABASE = TestDatabase.create();

  static final TestMail.Mail MAIL = TestMail.get();

  /**
   * Chosen before the app starts: the passkey origin and the links' base URL must name it, and a
   * random port is only known once the server is up. Chosen after the containers above start (the
   * fields initialise in order), so Docker cannot hand the same port to one of them.
   */
  static final int PORT = freePort();

  static final String BASE_URL = "http://localhost:" + PORT;

  static ConfigurableApplicationContext context;

  static Process app;

  @BeforeAll
  static void startTheApp() throws Exception {
    List<String> arguments =
        List.of(
            "--server.port=" + PORT,
            // The browser talks plain HTTP to localhost.
            "--server.servlet.session.cookie.secure=false",
            "--app.base-url=" + BASE_URL,
            "--app.owner-email=" + OWNER_EMAIL,
            "--app.owner-name=" + OWNER_NAME,
            "--who.passkey.allowed-origins=" + BASE_URL,
            "--who.passkey.rp-id=localhost",
            "--spring.datasource.url=" + DATABASE.url(),
            "--spring.datasource.username=" + DATABASE.username(),
            "--spring.datasource.password=" + DATABASE.password(),
            "--spring.mail.host=" + MAIL.smtpHost(),
            "--spring.mail.port=" + MAIL.smtpPort(),
            // The containers come from Testcontainers, not compose.yaml.
            "--spring.docker.compose.enabled=false",
            // who sends one link per address per interval (60s by default); the suite signs the
            // owner in several times in a row.
            "--who.email-link.resend-interval=1s");
    List<String> launcher = launcher();
    if (launcher.isEmpty()) {
      context = SpringApplication.run(DojoApplication.class, arguments.toArray(String[]::new));
    } else {
      var command = new ArrayList<String>(launcher);
      command.addAll(arguments);
      app = new ProcessBuilder(command).redirectErrorStream(true).redirectOutput(APP_LOG).start();
      awaitTheApp(Duration.ofMinutes(2));
    }
  }

  /** The command that starts the app as a process, or nothing to start it in this process. */
  private static List<String> launcher() {
    String binary = System.getProperty("app.binary", "");
    String traceJar = System.getProperty("app.trace-jar", "");
    if (!binary.isBlank()) {
      return List.of(new File(binary).getAbsolutePath());
    }
    if (!traceJar.isBlank()) {
      File java = new File(System.getProperty("java.home"), "bin/java");
      return List.of(
          java.getAbsolutePath(),
          "-agentlib:native-image-agent=config-merge-dir=" + TRACE_DIR.getAbsolutePath(),
          "-jar",
          new File(traceJar).getAbsolutePath());
    }
    return List.of();
  }

  @AfterAll
  static void stopTheApp() throws InterruptedException {
    if (context != null) {
      context.close();
    }
    if (app != null) {
      app.destroy();
      if (!app.waitFor(30, TimeUnit.SECONDS)) {
        app.destroyForcibly();
      }
    }
  }

  @Test
  void theSuitePassesInTheBrowser() throws Exception {
    var playwright =
        new ProcessBuilder(new File("target/node/npx").getAbsolutePath(), "playwright", "test")
            .directory(new File("e2e"))
            // A file, not inheritIO: output on the fork's stdout corrupts Maven's channel to it.
            .redirectErrorStream(true)
            .redirectOutput(LOG);
    var environment = playwright.environment();
    environment.put(
        "PATH",
        new File("target/node").getAbsolutePath() + File.pathSeparator + System.getenv("PATH"));
    environment.put("E2E_BASE_URL", BASE_URL);
    environment.put("E2E_MAILPIT_URL", MAIL.apiUrl());
    environment.put("E2E_OWNER_EMAIL", OWNER_EMAIL);
    environment.put("E2E_OWNER_NAME", OWNER_NAME);
    var process = playwright.start();

    boolean finished = process.waitFor(10, TimeUnit.MINUTES);
    if (!finished) {
      process.destroyForcibly();
    }
    assertThat(finished).as(() -> "playwright finished; its output:\n" + output()).isTrue();
    assertThat(process.exitValue())
        .as(() -> "playwright exit code; its output:\n" + output())
        .isZero();
  }

  /** Waits until the app's process answers HTTP, failing early if it exits. */
  private static void awaitTheApp(Duration timeout) throws InterruptedException {
    var client = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(2)).build();
    var request = HttpRequest.newBuilder(URI.create(BASE_URL + "/")).GET().build();
    Instant deadline = Instant.now().plus(timeout);
    while (Instant.now().isBefore(deadline)) {
      if (!app.isAlive()) {
        throw new IllegalStateException(
            "the app exited with " + app.exitValue() + "; its log:\n" + read(APP_LOG));
      }
      try {
        client.send(request, HttpResponse.BodyHandlers.discarding());
        return;
      } catch (IOException notYet) {
        Thread.sleep(250);
      }
    }
    throw new IllegalStateException("the app did not answer; its log:\n" + read(APP_LOG));
  }

  private static String output() {
    return read(LOG);
  }

  private static String read(File file) {
    try {
      return Files.readString(file.toPath());
    } catch (IOException e) {
      return "(no output: " + e.getMessage() + ")";
    }
  }

  private static int freePort() {
    try (var socket = new ServerSocket(0)) {
      return socket.getLocalPort();
    } catch (IOException e) {
      throw new UncheckedIOException(e);
    }
  }
}
