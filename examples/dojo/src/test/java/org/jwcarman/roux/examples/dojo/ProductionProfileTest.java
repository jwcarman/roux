package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.boot.WebApplicationType;
import org.springframework.boot.builder.SpringApplicationBuilder;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.core.env.Environment;

/** The prod profile takes its deployment settings from the environment and has no fallbacks. */
class ProductionProfileTest {

  static final TestDatabase.Database DATABASE = TestDatabase.create();

  private static final List<String> DEPLOYMENT =
      List.of(
          "--APP_BASE_URL=https://app.example.com",
          "--APP_OWNER_EMAIL=owner@example.com",
          "--APP_OWNER_NAME=Owner",
          "--MAIL_HOST=smtp.example.com",
          "--MAIL_PORT=587",
          "--MAIL_USERNAME=app",
          "--MAIL_PASSWORD=secret",
          "--MAIL_FROM=mail@example.com",
          "--PASSKEY_RP_ID=app.example.com",
          "--WHO_CODE_SECRET=prod-code-secret-0123456789abcdef0123");

  @Test
  void prodTakesItsSettingsFromTheEnvironment() {
    try (ConfigurableApplicationContext context = start(DEPLOYMENT)) {
      Environment env = context.getEnvironment();
      assertThat(env.getProperty("who.passkey.rp-id")).isEqualTo("app.example.com");
      assertThat(env.getProperty("who.passkey.allowed-origins"))
          .isEqualTo("https://app.example.com");
      assertThat(env.getProperty("who.email-link.link-base-url"))
          .isEqualTo("https://app.example.com/signin/link");
      assertThat(env.getProperty("who.email-link.from")).isEqualTo("mail@example.com");
      assertThat(env.getProperty("who.email-link.code-secret"))
          .isEqualTo("prod-code-secret-0123456789abcdef0123");
      assertThat(env.getProperty("spring.mail.host")).isEqualTo("smtp.example.com");
      assertThat(env.getProperty("server.servlet.session.cookie.secure", Boolean.class)).isTrue();
    }
  }

  @Test
  void prodWithoutACodeSecretFailsToStart() {
    List<String> withoutSecret =
        DEPLOYMENT.stream().filter(arg -> !arg.startsWith("--WHO_CODE_SECRET")).toList();

    // Spring leaves the unset ${WHO_CODE_SECRET} as literal text, which who rejects as too short.
    assertThatThrownBy(() -> start(withoutSecret).close())
        .hasStackTraceContaining("who.email-link.code-secret");
  }

  private static ConfigurableApplicationContext start(List<String> deployment) {
    List<String> args = new ArrayList<>(deployment);
    args.addAll(
        List.of(
            "--spring.datasource.url=" + DATABASE.url(),
            "--spring.datasource.username=" + DATABASE.username(),
            "--spring.datasource.password=" + DATABASE.password(),
            "--spring.docker.compose.enabled=false",
            "--server.port=0"));
    return new SpringApplicationBuilder(DojoApplication.class)
        .web(WebApplicationType.SERVLET)
        .profiles("prod")
        .run(args.toArray(String[]::new));
  }
}
