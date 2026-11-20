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

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.jwcarman.who.core.email.OutgoingEmail;
import org.jwcarman.who.core.email.WhoEmailSender;
import org.jwcarman.who.emaillink.EmailLinkMessage;
import org.jwcarman.who.emaillink.InvitationMessage;

/**
 * Stands in for real mail: remembers the sign-in and invitation links that would have been sent.
 */
public class RecordingWhoEmailSender implements WhoEmailSender {

  public record Sent(String address, String link, String code) {}

  private final List<Sent> sent = new CopyOnWriteArrayList<>();

  private volatile boolean failing;

  /**
   * Remembers a sign-in or invitation email, or fails if told to.
   *
   * @param email what who would send
   * @throws IllegalStateException after {@link #failSends()}
   */
  @Override
  public void send(OutgoingEmail email) {
    if (failing) {
      throw new IllegalStateException("mail is down");
    }
    switch (email.source()) {
      case EmailLinkMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      case InvitationMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      default -> {
        // Only the emails that carry a way to sign in are kept; an address confirmed or changed,
        // or a passkey added, is not a sign-in, and the app sends no other.
      }
    }
  }

  /**
   * The emails sent so far, oldest first.
   *
   * @return the emails, live
   */
  public List<Sent> sent() {
    return sent;
  }

  /** Forgets what was sent, and lets sends succeed again. */
  public void clear() {
    sent.clear();
    failing = false;
  }

  /** Makes every send fail until {@link #clear()}. */
  public void failSends() {
    failing = true;
  }
}
