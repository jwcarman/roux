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
package org.jwcarman.roux.spa;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.charset.StandardCharsets;
import java.security.SecureRandom;
import java.util.Base64;
import java.util.List;
import java.util.Objects;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import jakarta.servlet.http.HttpServletRequest;

import org.springframework.core.io.Resource;
import org.springframework.web.util.HtmlUtils;

import tools.jackson.databind.json.JsonMapper;

/**
 * The shell, {@code index.html} as Vite built it, ready to serve. The frontend's build marks three
 * places the server fills for each response, and the page is refused at startup if one is missing:
 *
 * <ul>
 *   <li>{@value #NONCE_PLACEHOLDER}, on every script and style tag ({@code html.cspNonce} in {@code
 *       vite.config.ts}): this request's nonce, the one its Content-Security-Policy allows;
 *   <li>{@value #APP_NAME_PLACEHOLDER}, in {@code <title>}: the app's name, HTML-escaped;
 *   <li>{@value #THEME_PLACEHOLDER}, inside {@code <script type="application/json">}: the theme as
 *       JSON, with every {@code <} escaped so nothing in it can end the element.
 * </ul>
 *
 * <p>The page is filled in one pass, so a value that looks like a placeholder (an app named {@code
 * __APP_THEME__}) is never filled in again. A page is never kept: a kept copy's nonce would not
 * match the policy of the next response.
 */
public final class ShellPage {

  /** What Vite writes where the nonce goes. */
  public static final String NONCE_PLACEHOLDER = "__CSP_NONCE__";

  /** What {@code index.html} holds where the theme's JSON goes. */
  public static final String THEME_PLACEHOLDER = "__APP_THEME__";

  /** What {@code index.html} holds where the app's name goes, in the title. */
  public static final String APP_NAME_PLACEHOLDER = "__APP_NAME__";

  private static final List<String> PLACEHOLDERS =
      List.of(NONCE_PLACEHOLDER, APP_NAME_PLACEHOLDER, THEME_PLACEHOLDER);

  private static final Pattern PLACEHOLDER =
      Pattern.compile(String.join("|", PLACEHOLDERS.stream().map(Pattern::quote).toList()));

  private static final String NONCE_ATTRIBUTE = ShellPage.class.getName() + ".nonce";
  private static final SecureRandom RANDOM = new SecureRandom();

  private final String template;
  private final ContentSecurityPolicy policy;
  private final ShellThemeSource themes;
  private final JsonMapper json;

  /**
   * Creates the page from the built {@code index.html}.
   *
   * @throws IllegalStateException if the page lacks one of the placeholders, naming it
   */
  public ShellPage(
      String template, ContentSecurityPolicy policy, ShellThemeSource themes, JsonMapper json) {
    for (String placeholder : PLACEHOLDERS) {
      if (!template.contains(placeholder)) {
        throw new IllegalStateException(
            "index.html has no "
                + placeholder
                + ": the shell cannot be served without it (see ShellPage)");
      }
    }
    this.template = template;
    this.policy = Objects.requireNonNull(policy, "policy");
    this.themes = Objects.requireNonNull(themes, "themes");
    this.json = Objects.requireNonNull(json, "json");
  }

  /**
   * Reads the built page.
   *
   * @throws UncheckedIOException if it cannot be read
   */
  public static String read(Resource page) {
    try (InputStream in = page.getInputStream()) {
      return new String(in.readAllBytes(), StandardCharsets.UTF_8);
    } catch (IOException e) {
      throw new UncheckedIOException("Cannot read " + page + ": build the frontend", e);
    }
  }

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

  /** The Content-Security-Policy for the response to {@code request}. */
  public String policyFor(HttpServletRequest request) {
    return policy.forNonce(nonce(request));
  }

  /** The page for {@code request}, with its nonce, the current theme and the app's name. */
  public String render(HttpServletRequest request) {
    ShellTheme theme = Objects.requireNonNull(themes.current(), "ShellThemeSource.current()");
    String nonce = nonce(request);
    Matcher matcher = PLACEHOLDER.matcher(template);
    StringBuilder page = new StringBuilder(template.length() + 512);
    while (matcher.find()) {
      matcher.appendReplacement(
          page, Matcher.quoteReplacement(value(matcher.group(), nonce, theme)));
    }
    matcher.appendTail(page);
    return page.toString();
  }

  private String value(String placeholder, String nonce, ShellTheme theme) {
    return switch (placeholder) {
      case NONCE_PLACEHOLDER -> nonce;
      case APP_NAME_PLACEHOLDER -> HtmlUtils.htmlEscape(theme.appName());
      default -> json.writeValueAsString(theme).replace("<", "\\u003c");
    };
  }
}
