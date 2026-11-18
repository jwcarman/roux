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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.jwcarman.who.core.email.OutgoingEmail;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * An app replaces one of roux's emails by putting a file of the same name in its own location
 * ({@code who.email.templates}), and one subject in its own messages; every other email stays
 * roux's.
 */
@SpringBootTest(
    classes = ContractTestApplication.class,
    properties = {
      "who.email.templates=classpath:/app-emails/",
      "spring.messages.basename=app-messages"
    })
class EmailOverrideContractTest extends EmailContractSupport {

  @Test
  void the_app_s_own_files_replace_roux_s_for_that_one_email() {
    OutgoingEmail signIn = render(EMAILS.get(0));

    assertThat(signIn.text()).isEqualTo("Custom sign-in text for " + APP + "\n");
    assertThat(signIn.html()).isEqualTo("<p>Custom sign-in html for " + APP + "</p>\n");
  }

  @Test
  void the_app_s_own_subject_replaces_roux_s_for_that_one_email() {
    assertThat(render(EMAILS.get(0)).subject()).isEqualTo("Custom subject for " + APP);
    assertThat(render(EMAILS.get(1)).subject()).isEqualTo("You've been invited to " + APP);
  }

  @Test
  void every_other_email_stays_roux_s() {
    OutgoingEmail invitation = render(EMAILS.get(1));

    assertThat(invitation.text())
        .startsWith(APP)
        .endsWith("You got this email from " + APP + ".\n");
    assertThat(invitation.html()).contains("You got this email from " + APP + ".");
  }
}
