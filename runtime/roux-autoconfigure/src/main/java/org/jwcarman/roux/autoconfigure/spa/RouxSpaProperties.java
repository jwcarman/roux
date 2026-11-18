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
package org.jwcarman.roux.autoconfigure.spa;

import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.jwcarman.roux.spa.ContentSecurityPolicy.Extendable;
import org.jwcarman.roux.spa.SpaFallbackFilter;
import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * The single-page app support's settings, under {@code roux.spa}.
 *
 * @param excludedPaths path patterns, besides {@link SpaFallbackFilter#DEFAULT_EXCLUDED_PATHS},
 *     that are never answered with the shell: the app's own server-rendered pages, say
 * @param csp sources to add to the shell's Content-Security-Policy
 */
@ConfigurationProperties("roux.spa")
public record RouxSpaProperties(@DefaultValue List<String> excludedPaths, @DefaultValue Csp csp) {

  /**
   * What the app allows beyond the strict default, under {@code roux.spa.csp}, one list per
   * directive. Each source is added after the default ones: nothing here replaces a default or
   * loosens {@code default-src}, {@code object-src}, {@code base-uri} or {@code frame-ancestors},
   * which have no setting. A source that would loosen the policy (a wildcard, an unsafe keyword) is
   * refused at startup.
   *
   * @param scriptSrc hosts scripts may load from
   * @param styleSrc hosts styles may load from
   * @param imgSrc where images may load from
   * @param fontSrc where fonts may load from
   * @param connectSrc where the app may call (fetch, WebSocket), besides its own origin
   * @param frameSrc what the app may embed
   * @param mediaSrc where audio and video may load from
   * @param formAction where a form may submit to
   */
  public record Csp(
      @DefaultValue List<String> scriptSrc,
      @DefaultValue List<String> styleSrc,
      @DefaultValue List<String> imgSrc,
      @DefaultValue List<String> fontSrc,
      @DefaultValue List<String> connectSrc,
      @DefaultValue List<String> frameSrc,
      @DefaultValue List<String> mediaSrc,
      @DefaultValue List<String> formAction) {

    /** The settings, keyed by the directive they extend. */
    Map<Extendable, List<String>> sources() {
      Map<Extendable, List<String>> sources = new EnumMap<>(Extendable.class);
      sources.put(Extendable.SCRIPT_SRC, scriptSrc);
      sources.put(Extendable.STYLE_SRC, styleSrc);
      sources.put(Extendable.IMG_SRC, imgSrc);
      sources.put(Extendable.FONT_SRC, fontSrc);
      sources.put(Extendable.CONNECT_SRC, connectSrc);
      sources.put(Extendable.FRAME_SRC, frameSrc);
      sources.put(Extendable.MEDIA_SRC, mediaSrc);
      sources.put(Extendable.FORM_ACTION, formAction);
      return sources;
    }
  }
}
