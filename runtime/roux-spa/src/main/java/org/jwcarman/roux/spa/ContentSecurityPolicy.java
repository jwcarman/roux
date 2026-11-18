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

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.regex.Pattern;

/**
 * The Content-Security-Policy of the shell. The default is strict: everything from the app's own
 * origin, scripts and styles also with the response's nonce, no plugins, no framing, forms only to
 * the app. Nothing inline runs without the nonce, and {@code 'unsafe-inline'} and {@code
 * 'unsafe-eval'} are never in it.
 *
 * <p>An app that needs more (an image CDN, an API on another host) adds sources to a directive it
 * names; {@link #extendedBy} appends them after the defaults and never replaces what is there. Only
 * the {@link Extendable} directives can be extended. {@code default-src}, {@code object-src},
 * {@code base-uri} and {@code frame-ancestors} have no way to be loosened at all, and a source that
 * would undo the policy ({@code *}, the unsafe keywords, a scheme alone for scripts and styles, or
 * anything that would end the directive) is refused when the policy is built, so a bad setting
 * stops the application from starting instead of weakening it.
 */
public final class ContentSecurityPolicy {

  /** The header's name. */
  public static final String HEADER = "Content-Security-Policy";

  /** The directives an app may add sources to, in the order they are written. */
  public enum Extendable {
    SCRIPT_SRC("script-src", "'self'", true),
    STYLE_SRC("style-src", "'self'", true),
    IMG_SRC("img-src", "'self' data:", false),
    FONT_SRC("font-src", "'self'", false),
    CONNECT_SRC("connect-src", "'self'", false),
    FRAME_SRC("frame-src", "'self'", false),
    MEDIA_SRC("media-src", "'self'", false),
    FORM_ACTION("form-action", "'self'", false);

    private final String directive;
    private final String base;
    private final boolean nonced;

    Extendable(String directive, String base, boolean nonced) {
      this.directive = directive;
      this.base = base;
      this.nonced = nonced;
    }

    /** The directive's name in the header. */
    public String directive() {
      return directive;
    }
  }

  private static final Set<String> NEVER =
      Set.of("*", "'unsafe-inline'", "'unsafe-eval'", "'unsafe-hashes'");

  private static final Pattern SCHEME_ONLY = Pattern.compile("[a-zA-Z][a-zA-Z0-9+.-]*:");

  private static final Pattern SOURCE = Pattern.compile("[^\\s;,]+");

  private static final ContentSecurityPolicy STRICT =
      new ContentSecurityPolicy(new EnumMap<>(Extendable.class));

  private final Map<Extendable, List<String>> added;

  private ContentSecurityPolicy(Map<Extendable, List<String>> added) {
    this.added = added;
  }

  /** The strict default. */
  public static ContentSecurityPolicy strict() {
    return STRICT;
  }

  /**
   * This policy with {@code sources} added to the named directives, after the defaults.
   *
   * @throws IllegalArgumentException for a source that would loosen the policy past what a source
   *     list is for, naming the directive and the source
   */
  public ContentSecurityPolicy extendedBy(Map<Extendable, List<String>> sources) {
    Map<Extendable, List<String>> all = new EnumMap<>(Extendable.class);
    added.forEach((directive, existing) -> all.put(directive, new ArrayList<>(existing)));
    sources.forEach(
        (directive, values) -> {
          values.forEach(value -> check(directive, value));
          all.computeIfAbsent(directive, d -> new ArrayList<>()).addAll(values);
        });
    return new ContentSecurityPolicy(all);
  }

  private static void check(Extendable directive, String source) {
    if (!SOURCE.matcher(source).matches()) {
      throw refused(directive, source, "is not one source: no spaces, ';' or ','");
    }
    if (NEVER.contains(source.toLowerCase(Locale.ROOT))) {
      throw refused(directive, source, "would loosen the policy for everything");
    }
    if (directive.nonced && SCHEME_ONLY.matcher(source).matches()) {
      throw refused(
          directive, source, "would allow every " + source + " " + directive.directive + " source");
    }
  }

  private static IllegalArgumentException refused(Extendable directive, String source, String why) {
    return new IllegalArgumentException(
        "roux.spa.csp." + directive.directive + ": '" + source + "' " + why);
  }

  /** The header's value for a response whose inline scripts and styles carry {@code nonce}. */
  public String forNonce(String nonce) {
    String nonced = "'nonce-" + nonce + "'";
    List<String> directives = new ArrayList<>();
    directives.add("default-src 'self'");
    for (Extendable directive : Extendable.values()) {
      directives.add(directive.directive + " " + sources(directive, nonced));
    }
    directives.add("object-src 'none'");
    directives.add("base-uri 'self'");
    directives.add("frame-ancestors 'none'");
    return String.join("; ", directives);
  }

  private String sources(Extendable directive, String nonced) {
    List<String> sources = new ArrayList<>();
    sources.add(directive.base);
    if (directive.nonced) {
      sources.add(nonced);
    }
    sources.addAll(added.getOrDefault(directive, List.of()));
    return String.join(" ", sources);
  }
}
