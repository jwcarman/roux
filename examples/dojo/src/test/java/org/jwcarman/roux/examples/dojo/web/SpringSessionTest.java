package org.jwcarman.roux.examples.dojo.web;

import static org.assertj.core.api.Assertions.assertThat;
import static org.awaitility.Awaitility.await;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.examples.dojo.DojoApplication;
import org.jwcarman.roux.test.RecordingWhoEmailSender;
import org.jwcarman.roux.test.TestDatabase;
import org.jwcarman.who.emaillink.EmailCredentialService;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.web.server.context.WebServerApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.context.annotation.Bean;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.session.FindByIndexNameSessionRepository;
import org.springframework.session.Session;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;

/**
 * Sessions live in PostgreSQL (Spring Session JDBC): signed in through the app's real HTTP flow, a
 * session is a row in {@code SPRING_SESSION}, and it outlives the process that created it.
 */
class SpringSessionTest {

  static final String OWNER = "owner@example.com";

  static final TestDatabase.Database DATABASE = TestDatabase.create();

  @DynamicPropertySource
  static void database(DynamicPropertyRegistry registry) {
    TestDatabase.register(registry, DATABASE);
  }

  @TestConfiguration(proxyBeanMethods = false)
  static class Mail {
    @Bean
    RecordingWhoEmailSender recordingSender() {
      return new RecordingWhoEmailSender();
    }
  }

  private ConfigurableApplicationContext context;

  @AfterEach
  void stop() {
    if (context != null) {
      context.close();
    }
  }

  @Test
  void sessionsAreStoredInPostgres() throws Exception {
    context = start();
    Client browser = new Client(port(context));

    browser.signIn(context, OWNER);

    assertThat(
            jdbc(context)
                .queryForObject(
                    "select count(*) from spring_session where session_id = ?",
                    Integer.class,
                    browser.sessionId()))
        .isEqualTo(1);
  }

  @Test
  void sessionSurvivesARestart() throws Exception {
    context = start();
    Client browser = new Client(port(context));
    browser.signIn(context, OWNER);
    String before = browser.get("/who/me").body();
    assertThat(browser.get("/who/me").statusCode()).isEqualTo(200);

    context.close();
    context = start();
    browser.port = port(context);

    HttpResponse<String> after = browser.get("/who/me");
    assertThat(after.statusCode()).isEqualTo(200);
    assertThat(after.body()).isEqualTo(before);
  }

  @Test
  void sessionHoldsWhosAttributeAndThePrincipalIndex() throws Exception {
    context = start();
    Client browser = new Client(port(context));
    browser.signIn(context, OWNER);
    browser.get("/who/me");

    List<String> names =
        jdbc(context)
            .queryForList(
                "select a.attribute_name from spring_session_attributes a join spring_session s"
                    + " on s.primary_id = a.session_primary_id where s.session_id = ?"
                    + " order by a.attribute_name",
                String.class,
                browser.sessionId());
    assertThat(names)
        .containsExactlyInAnyOrder(
            FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME, "org.jwcarman.who.session");
  }

  @Test
  void sessionIsFoundByThePrincipalIndex() throws Exception {
    context = start();
    Client browser = new Client(port(context));
    browser.signIn(context, OWNER);
    browser.get("/who/me");
    UUID credentialId =
        context.getBean(EmailCredentialService.class).findByAddress(OWNER).orElseThrow().id();
    UUID identityId =
        jdbc(context)
            .queryForObject(
                "select identity_id from who_credential_identity where credential_id = ?",
                UUID.class,
                credentialId);

    FindByIndexNameSessionRepository<?> sessions =
        context.getBean(FindByIndexNameSessionRepository.class);
    Map<String, ? extends Session> found = sessions.findByPrincipalName(identityId.toString());

    assertThat(found).containsKey(browser.sessionId());
  }

  private static ConfigurableApplicationContext start() {
    return new SpringApplicationBuilder(DojoApplication.class, Mail.class)
        .run(
            "--server.port=0",
            "--server.servlet.session.cookie.secure=false",
            "--roux.owner.email=" + OWNER,
            "--roux.owner.name=Owner",
            "--spring.datasource.url=" + DATABASE.url(),
            "--spring.datasource.username=" + DATABASE.username(),
            "--spring.datasource.password=" + DATABASE.password(),
            "--spring.docker.compose.enabled=false",
            // Each test signs the owner in again; who otherwise sends one link a minute.
            "--who.email-link.resend-interval=1ms");
  }

  private static int port(ConfigurableApplicationContext context) {
    return ((WebServerApplicationContext) context).getWebServer().getPort();
  }

  private static JdbcTemplate jdbc(ConfigurableApplicationContext context) {
    return context.getBean(JdbcTemplate.class);
  }

  /** A browser: keeps cookies and echoes the CSRF cookie in a header, as the SPA does. */
  static final class Client {
    private final HttpClient http = HttpClient.newHttpClient();
    private final Map<String, String> cookies = new LinkedHashMap<>();
    int port;

    Client(int port) {
      this.port = port;
    }

    void signIn(ConfigurableApplicationContext context, String address) throws Exception {
      RecordingWhoEmailSender mail = context.getBean(RecordingWhoEmailSender.class);
      mail.clear();
      get("/who/me");
      assertThat(post("/who/email/send", "{\"email\":\"" + address + "\"}").statusCode())
          .isBetween(200, 299);
      // who issues the link on its own thread.
      await().atMost(Duration.ofSeconds(10)).until(() -> !mail.sent().isEmpty());
      String link = mail.sent().getLast().link();
      String token = link.substring(link.indexOf("#token=") + "#token=".length());
      assertThat(post("/who/email/sign-in", "{\"token\":\"" + token + "\"}").statusCode())
          .isBetween(200, 299);
      assertThat(cookies).containsKey("SESSION");
    }

    /** The session id the cookie carries (Spring Session base64-encodes it). */
    String sessionId() {
      return new String(Base64.getDecoder().decode(cookies.get("SESSION")), StandardCharsets.UTF_8);
    }

    HttpResponse<String> get(String path) throws Exception {
      return send(HttpRequest.newBuilder(uri(path)).GET());
    }

    HttpResponse<String> post(String path, String json) throws Exception {
      HttpRequest.Builder request =
          HttpRequest.newBuilder(uri(path))
              .header("Content-Type", "application/json")
              .POST(HttpRequest.BodyPublishers.ofString(json));
      String xsrf = cookies.get("XSRF-TOKEN");
      if (xsrf != null) {
        request.header("X-XSRF-TOKEN", xsrf);
      }
      return send(request);
    }

    private URI uri(String path) {
      return URI.create("http://localhost:" + port + path);
    }

    private HttpResponse<String> send(HttpRequest.Builder request) throws Exception {
      if (!cookies.isEmpty()) {
        request.header(
            "Cookie",
            cookies.entrySet().stream()
                .map(c -> c.getKey() + "=" + c.getValue())
                .collect(Collectors.joining("; ")));
      }
      request.header("Accept", "application/json");
      HttpResponse<String> response =
          http.send(request.build(), HttpResponse.BodyHandlers.ofString());
      for (String header : response.headers().allValues("Set-Cookie")) {
        String pair =
            header.substring(0, header.indexOf(';') < 0 ? header.length() : header.indexOf(';'));
        String name = pair.substring(0, pair.indexOf('='));
        String value = pair.substring(pair.indexOf('=') + 1);
        if (value.isEmpty() || header.toLowerCase().contains("max-age=0")) {
          cookies.remove(name);
        } else {
          cookies.put(name, value);
        }
      }
      return response;
    }
  }
}
