package org.jwcarman.roux.examples.dojo;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.jwcarman.who.emaillink.EmailLinkMessage;
import org.jwcarman.who.emaillink.EmailLinkSender;
import org.jwcarman.who.emaillink.WhoEmail;

/** Stands in for real mail: remembers the sign-in links that would have been sent. */
public class RecordingEmailLinkSender implements EmailLinkSender {

  public record Sent(String address, String link, String code) {}

  private final List<Sent> sent = new CopyOnWriteArrayList<>();

  private volatile boolean failing;

  @Override
  public void send(WhoEmail email) {
    if (failing) {
      throw new IllegalStateException("mail is down");
    }
    // who's other emails (an address confirmed or changed) are not sign-ins; the app sends none.
    if (email instanceof EmailLinkMessage message) {
      sent.add(new Sent(message.address(), message.link(), message.code()));
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
