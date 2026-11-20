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

import java.util.Map;

import org.junit.jupiter.api.Test;

class TestMailTest {

  private static final String HOST = "ROUX_TEST_MAIL_SMTP_HOST";
  private static final String PORT = "ROUX_TEST_MAIL_SMTP_PORT";
  private static final String API = "ROUX_TEST_MAIL_API_URL";

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

  @Test
  void aBlankHostMeansNoMail() {
    assertThat(TestMail.fromEnvironment(Map.of(HOST, " "))).isEmpty();
  }

  @Test
  void aBlankApiUrlIsAnError() {
    Map<String, String> env = Map.of(HOST, "mailpit", PORT, "1025", API, " ");
    assertThatThrownBy(() -> TestMail.fromEnvironment(env))
        .isInstanceOf(IllegalStateException.class)
        .hasMessageContaining(API);
  }
}
