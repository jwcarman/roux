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
package org.jwcarman.roux.organization;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.Locale;
import java.util.Objects;

/**
 * The organization's calendar: what today and this month are where the organization is. It reads
 * only the instant from the app's {@link Clock} and applies the organization's zone, never the
 * clock's own, so a business date never depends on where the server runs.
 */
public final class OrganizationCalendar {

  private final Clock clock;
  private final ZoneId zone;
  private final Locale locale;

  /**
   * Creates the calendar.
   *
   * @param clock the app's clock (its instant is used, not its zone)
   * @param zone the organization's time zone ({@code roux.organization.time-zone})
   * @param locale the organization's locale ({@code roux.organization.locale})
   */
  public OrganizationCalendar(Clock clock, ZoneId zone, Locale locale) {
    this.clock = Objects.requireNonNull(clock, "clock");
    this.zone = Objects.requireNonNull(zone, "zone");
    this.locale = Objects.requireNonNull(locale, "locale");
  }

  /** The organization's time zone. */
  public ZoneId zone() {
    return zone;
  }

  /** The organization's locale: how its dates, numbers and amounts are written. */
  public Locale locale() {
    return locale;
  }

  /** This moment, in the organization's zone. */
  public ZonedDateTime now() {
    return clock.instant().atZone(zone);
  }

  /** The organization's date today. */
  public LocalDate today() {
    return now().toLocalDate();
  }

  /** The organization's month now. */
  public YearMonth thisMonth() {
    return YearMonth.from(today());
  }

  /** When the organization's today ends: its next midnight, so a 23- or 25-hour day is right. */
  public Instant todayEndsAt() {
    return today().plusDays(1).atStartOfDay(zone).toInstant();
  }
}
