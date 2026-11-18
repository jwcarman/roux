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
import org.jwcarman.who.core.email.WhoEmail;
import org.springframework.boot.test.context.SpringBootTest;

/**
 * roux's finished emails as an application gets them from the starter: every one names the app,
 * HTML escapes it, and the brand colour is the button's.
 */
@SpringBootTest(classes = ContractTestApplication.class)
class EmailContractTest extends EmailContractSupport {

  @Test
  void every_email_names_the_app_in_its_subject_and_both_bodies() {
    for (WhoEmail email : EMAILS) {
      OutgoingEmail out = render(email);

      assertThat(out.subject()).as(email.template() + " subject").contains(APP);
      assertThat(out.text())
          .as(email.template() + " text")
          .startsWith(APP)
          .endsWith("You got this email from " + APP + ".\n");
      assertThat(out.html())
          .as(email.template() + " html")
          .contains("<title>" + APP + "</title>")
          .contains("You got this email from " + APP + ".");
    }
  }

  @Test
  void the_subjects_are_roux_s_not_who_s() {
    assertThat(EMAILS.stream().map(email -> render(email).subject()))
        .containsExactly(
            "Sign in to roux-contract-tests",
            "You've been invited to roux-contract-tests",
            "Confirm your email address for roux-contract-tests",
            "Your roux-contract-tests email address was changed",
            "A passkey was added to your roux-contract-tests account");
  }

  @Test
  void who_s_values_are_in_both_bodies() {
    OutgoingEmail signIn = render(EMAILS.get(0));

    assertThat(signIn.text())
        .contains("Sign in: http://localhost/signin/link#token=abc")
        .contains("Or enter this code: K7F-2QM")
        .contains("expire in 15 minutes");
    assertThat(signIn.html())
        .contains("K7F-2QM")
        .contains("expire in 15 minutes")
        .contains("href=\"http://localhost/signin/link#token&#x3D;abc\"");
    assertThat(render(EMAILS.get(4)).html()).contains("Laptop");
  }

  @Test
  void an_app_name_holding_markup_is_escaped_in_html_and_left_alone_in_text_and_subjects() {
    theOwnerChooses("<b>&", "gray", "#3b82f6");

    for (WhoEmail email : EMAILS) {
      OutgoingEmail out = render(email);

      assertThat(out.html()).as(email.template()).contains("&lt;b&gt;&amp;").doesNotContain("<b>");
      assertThat(out.text()).as(email.template()).contains("<b>&");
      assertThat(out.subject()).as(email.template()).contains("<b>&");
    }
  }

  @Test
  void the_button_wears_the_named_palette() {
    theOwnerChooses("Dojo", "teal", "#ff8800");

    assertThat(render(EMAILS.get(0)).html())
        .contains("background-color:#0d9488;")
        .contains("color:#18181b;text-decoration:none");
  }

  @Test
  void the_button_wears_the_brand_color_with_text_that_reads_on_it() {
    theOwnerChooses("Dojo", "brand", "#1a237e");

    assertThat(render(EMAILS.get(0)).html())
        .contains("background-color:#1a237e;")
        .contains("color:#ffffff;text-decoration:none");
  }

  @Test
  void the_next_email_shows_a_change_the_owner_just_made() {
    assertThat(render(EMAILS.get(0)).subject()).isEqualTo("Sign in to roux-contract-tests");

    theOwnerChooses("Dojo", "gray", "#3b82f6");

    assertThat(render(EMAILS.get(0)).subject()).isEqualTo("Sign in to Dojo");
  }
}
