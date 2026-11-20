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
package org.jwcarman.roux.autoconfigure.organization;

import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Locale;
import java.util.regex.Pattern;

import org.jspecify.annotations.Nullable;
import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Where the organization is: {@code roux.organization.*}. Both are required; an app without them
 * does not start.
 *
 * @param timeZone the organization's IANA time zone ({@code America/New_York}): where its day
 *     starts and ends
 * @param locale the organization's locale as a BCP 47 tag ({@code en-US}): how its dates, numbers
 *     and amounts are written
 */
@ConfigurationProperties("roux.organization")
public record RouxOrganizationProperties(@Nullable ZoneId timeZone, @Nullable String locale) {

  /** A zone that is an offset from UTC, GMT or UT ({@code UTC+3}), not a place. */
  private static final Pattern FIXED_OFFSET = Pattern.compile("(UTC|GMT|UT)[+-].*");

  /**
   * Checks both settings are set and the locale is one this server has.
   *
   * @throws IllegalArgumentException naming the setting that is missing or wrong
   */
  public RouxOrganizationProperties {
    if (timeZone == null) {
      throw new IllegalArgumentException(
          "roux.organization.time-zone must be set to the organization's time zone"
              + " (an IANA name such as America/New_York)");
    }
    if (timeZone instanceof ZoneOffset || FIXED_OFFSET.matcher(timeZone.getId()).matches()) {
      throw new IllegalArgumentException(
          "roux.organization.time-zone must be a place's time zone, not a fixed offset"
              + " (an IANA name such as America/New_York): "
              + timeZone.getId());
    }
    if (locale == null || locale.isBlank()) {
      throw new IllegalArgumentException(
          "roux.organization.locale must be set to the organization's locale"
              + " (a BCP 47 tag such as en-US)");
    }
    Locale parsed = Locale.forLanguageTag(locale);
    boolean known = Arrays.asList(Locale.getAvailableLocales()).contains(parsed);
    if (known
        && !parsed.toLanguageTag().equals(locale)
        && parsed.toLanguageTag().equalsIgnoreCase(locale)) {
      throw new IllegalArgumentException(
          "roux.organization.locale must be written " + parsed.toLanguageTag() + ", not " + locale);
    }
    if (!known || !parsed.toLanguageTag().equals(locale)) {
      throw new IllegalArgumentException(
          "roux.organization.locale is not a locale this server knows: " + locale);
    }
  }

  /** The checked locale. */
  public Locale toLocale() {
    return Locale.forLanguageTag(locale);
  }
}
