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
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;
import static org.mockito.Mockito.mock;

import java.time.Duration;
import java.time.Instant;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.RecordingWhoEmailSender.Sent;
import org.jwcarman.who.core.email.OutgoingEmail;
import org.jwcarman.who.core.email.WhoEmail;
import org.jwcarman.who.emaillink.EmailLinkMessage;
import org.jwcarman.who.emaillink.InvitationMessage;

class RecordingWhoEmailSenderTest {

  private final RecordingWhoEmailSender sender = new RecordingWhoEmailSender();

  private static OutgoingEmail email(WhoEmail source) {
    return new OutgoingEmail("to@example.org", "subject", "text", "<p>html</p>", source);
  }

  @Test
  void keepsSignInAndInvitationLinksInOrder() {
    sender.send(
        email(
            new EmailLinkMessage(
                "ada@example.org", "https://x/link", "111111", Instant.EPOCH, Duration.ZERO)));
    sender.send(
        email(
            new InvitationMessage(
                "bo@example.org",
                "https://x/invite",
                "222222",
                Instant.EPOCH,
                Duration.ZERO,
                Set.of("MEMBER"))));

    assertThat(sender.sent())
        .containsExactly(
            new Sent("ada@example.org", "https://x/link", "111111"),
            new Sent("bo@example.org", "https://x/invite", "222222"));
  }

  @Test
  void otherEmailsAreNotSignIns() {
    sender.send(email(mock(WhoEmail.class)));

    assertThat(sender.sent()).isEmpty();
  }

  @Test
  void failsUntilCleared() {
    sender.failSends();
    OutgoingEmail any = email(mock(WhoEmail.class));

    assertThatIllegalStateException().isThrownBy(() -> sender.send(any));

    sender.clear();
    sender.send(any);
    assertThat(sender.sent()).isEmpty();
  }
}
