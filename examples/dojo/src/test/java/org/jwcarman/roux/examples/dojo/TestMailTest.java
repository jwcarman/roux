package org.jwcarman.roux.examples.dojo;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Map;

import org.junit.jupiter.api.Test;

class TestMailTest {

  private static final String HOST = "DOJO_TEST_MAIL_SMTP_HOST";
  private static final String PORT = "DOJO_TEST_MAIL_SMTP_PORT";
  private static final String API = "DOJO_TEST_MAIL_API_URL";

  @Test
  void environmentMailIsUsedWhenSet() {
    var mail =
        TestMail.fromEnvironment(Map.of(HOST, "mailpit", PORT, "1025", API, "http://mailpit:8025"));

    assertThat(mail).contains(new TestMail.Mail("mailpit", 1025, "http://mailpit:8025"));
  }

  @Test
  void noEnvironmentMeansNoMail() {
    assertThat(TestMail.fromEnvironment(Map.of())).isEmpty();
  }

  @Test
  void hostWithoutPortIsAnError() {
    Map<String, String> env = Map.of(HOST, "mailpit", API, "http://mailpit:8025");

    assertThatThrownBy(() -> TestMail.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(PORT);
  }

  @Test
  void hostWithoutApiUrlIsAnError() {
    Map<String, String> env = Map.of(HOST, "mailpit", PORT, "1025");

    assertThatThrownBy(() -> TestMail.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(API);
  }

  @Test
  void nonNumericPortIsAnError() {
    Map<String, String> env = Map.of(HOST, "mailpit", PORT, "smtp", API, "http://mailpit:8025");

    assertThatThrownBy(() -> TestMail.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(PORT);
  }

  @Test
  void getReturnsAReachableMailpit() {
    var mail = TestMail.get();

    assertThat(mail.smtpHost()).isNotBlank();
    assertThat(mail.smtpPort()).isPositive();
    assertThat(mail.apiUrl()).startsWith("http");
  }
}
