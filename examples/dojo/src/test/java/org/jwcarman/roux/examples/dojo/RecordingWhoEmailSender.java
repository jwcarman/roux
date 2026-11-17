package org.jwcarman.roux.examples.dojo;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.jwcarman.who.emaillink.EmailAddressChangedMessage;
import org.jwcarman.who.emaillink.EmailAddressConfirmationMessage;
import org.jwcarman.who.emaillink.EmailLinkMessage;
import org.jwcarman.who.emaillink.InvitationMessage;
import org.jwcarman.who.emaillink.WhoEmail;
import org.jwcarman.who.emaillink.WhoEmailSender;

/**
 * Stands in for real mail: remembers the sign-in and invitation links that would have been sent.
 */
public class RecordingWhoEmailSender implements WhoEmailSender {

  public record Sent(String address, String link, String code) {}

  private final List<Sent> sent = new CopyOnWriteArrayList<>();

  private volatile boolean failing;

  @Override
  public void send(WhoEmail email) {
    if (failing) {
      throw new IllegalStateException("mail is down");
    }
    // Exhaustive, with no default: a new kind of who email must be decided here, not dropped.
    switch (email) {
      case EmailLinkMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      case InvitationMessage message ->
          sent.add(new Sent(message.address(), message.link(), message.code()));
      // An address confirmed or changed is not a sign-in; the app sends none.
      case EmailAddressConfirmationMessage _ -> {}
      case EmailAddressChangedMessage _ -> {}
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
