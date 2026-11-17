package org.jwcarman.roux.examples.dojo.web;

import java.security.SecureRandom;
import java.util.Base64;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.security.web.header.HeaderWriter;

/**
 * The app's Content-Security-Policy: the browser runs and applies only the app's own files and the
 * inline scripts and styles carrying this response's nonce. An injected {@code <script>} has no
 * nonce, so it never runs. The nonce is new on every request, and the page that uses it is rendered
 * per request ({@link ShellController}).
 */
public final class ContentSecurityPolicy {

  public static final String HEADER = "Content-Security-Policy";

  private static final String NONCE_ATTRIBUTE = ContentSecurityPolicy.class.getName() + ".nonce";
  private static final SecureRandom RANDOM = new SecureRandom();

  private ContentSecurityPolicy() {}

  /** This request's nonce, 128 random bits in base64: one per request, made on first use. */
  public static String nonce(HttpServletRequest request) {
    if (request.getAttribute(NONCE_ATTRIBUTE) instanceof String nonce) {
      return nonce;
    }
    byte[] bytes = new byte[16];
    RANDOM.nextBytes(bytes);
    String nonce = Base64.getEncoder().encodeToString(bytes);
    request.setAttribute(NONCE_ATTRIBUTE, nonce);
    return nonce;
  }

  /** The policy for a response whose inline scripts and styles carry {@code nonce}. */
  public static String forNonce(String nonce) {
    String appOrNonced = "'self' 'nonce-" + nonce + "'";
    return String.join(
        "; ",
        "default-src 'self'",
        "script-src " + appOrNonced,
        "style-src " + appOrNonced,
        "img-src 'self' data:",
        "font-src 'self'",
        "connect-src 'self'",
        "object-src 'none'",
        "base-uri 'none'",
        "form-action 'self'",
        "frame-ancestors 'none'");
  }

  /** Writes the policy, with the request's nonce, on every response (Spring Security's headers). */
  public static HeaderWriter headerWriter() {
    return (request, response) -> response.setHeader(HEADER, forNonce(nonce(request)));
  }
}
