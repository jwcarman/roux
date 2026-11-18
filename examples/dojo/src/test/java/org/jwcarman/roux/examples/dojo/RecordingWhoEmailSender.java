package org.jwcarman.roux.examples.dojo;

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

  @Override
  public void send(OutgoingEmail email) {
    if (failing) {
      throw new IllegalStateException("mail is down");
    }
    // Only the emails that carry a way to sign in are kept; an address confirmed or changed, or a
    // passkey added, is not a sign-in, and the app sends no other.
    switch (email.source()) {
      case EmailLinkMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      case InvitationMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      default -> {}
    }
  }

  public List<Sent> sent() {
    return sent;
  }

  public void clear() {
    sent.clear();
    failing = false;
  }

  /** Makes every send fail until {@link #clear()}. */
  public void failSends() {
    failing = true;
  }
}
