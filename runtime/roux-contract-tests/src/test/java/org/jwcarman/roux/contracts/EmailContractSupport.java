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

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Locale;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.jwcarman.who.core.email.OutgoingEmail;
import org.jwcarman.who.core.email.WhoEmail;
import org.jwcarman.who.core.email.WhoEmailRenderer;
import org.jwcarman.who.emaillink.EmailAddressChangedMessage;
import org.jwcarman.who.emaillink.EmailAddressConfirmationMessage;
import org.jwcarman.who.emaillink.EmailLinkMessage;
import org.jwcarman.who.emaillink.InvitationMessage;
import org.jwcarman.who.passkey.PasskeyAddedMessage;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

/** The five emails, rendered through who's real renderer as an application gets it. */
abstract class EmailContractSupport {

  static final String APP = "roux-contract-tests";

  static final List<WhoEmail> EMAILS =
      List.of(
          new EmailLinkMessage(
              "ada@example.test",
              "http://localhost/signin/link#token=abc",
              "K7F2QM",
              Instant.parse("2026-11-18T12:00:00Z"),
              Duration.ofMinutes(15)),
          new InvitationMessage(
              "ada@example.test",
              "http://localhost/signin/link#token=abc",
              "K7F2QM",
              Instant.parse("2026-11-18T12:00:00Z"),
              Duration.ofDays(7),
              Set.of("member")),
          new EmailAddressConfirmationMessage(
              "ada@example.test",
              "http://localhost/confirm#token=abc",
              "K7F2QM",
              Instant.parse("2026-11-18T12:00:00Z"),
              Duration.ofMinutes(15),
              true),
          new EmailAddressChangedMessage("ada@example.test", "ada@new.example.test"),
          new PasskeyAddedMessage("ada@example.test", "Laptop"));

  @Autowired WhoEmailRenderer renderer;
  @Autowired JdbcTemplate jdbc;

  /** The owner has chosen nothing: the stock look under the application's name. */
  @BeforeEach
  void freshTheme() {
    jdbc.update(
        "update roux_theme set version = 0, app_name = null, palette = null, brand_color = null,"
            + " shape = null, heading_font = null, body_font = null");
  }

  void theOwnerChooses(String appName, String palette, String brandColor) {
    jdbc.update(
        "update roux_theme set app_name = ?, palette = ?, brand_color = ?",
        appName,
        palette,
        brandColor);
  }

  OutgoingEmail render(WhoEmail email) {
    return renderer.render(email, Locale.ENGLISH);
  }
}
