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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Locale;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

@DisplayNameGeneration(ReplaceUnderscores.class)
class OrganizationCalendarTest {

  private static final ZoneId NY = ZoneId.of("America/New_York");

  private static OrganizationCalendar at(String instant, ZoneId zone) {
    return new OrganizationCalendar(
        Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), zone, Locale.US);
  }

  @Test
  void today_is_the_organizations_date_not_utcs() {
    OrganizationCalendar calendar = at("2026-11-21T03:00:00Z", NY);
    assertThat(calendar.today()).isEqualTo(LocalDate.parse("2026-11-20"));
    assertThat(calendar.thisMonth()).isEqualTo(YearMonth.parse("2026-11"));
  }

  @Test
  void a_zone_ahead_of_utc_is_already_tomorrow() {
    assertThat(at("2026-11-20T12:00:00Z", ZoneId.of("Pacific/Auckland")).today())
        .isEqualTo(LocalDate.parse("2026-11-21"));
  }

  @Test
  void the_clocks_own_zone_is_ignored() {
    Clock tokyo = Clock.fixed(Instant.parse("2026-11-21T03:00:00Z"), ZoneId.of("Asia/Tokyo"));
    assertThat(new OrganizationCalendar(tokyo, NY, Locale.US).today())
        .isEqualTo(LocalDate.parse("2026-11-20"));
  }

  @Test
  void today_ends_at_the_next_local_midnight() {
    assertThat(at("2026-11-20T15:00:00Z", NY).todayEndsAt())
        .isEqualTo(Instant.parse("2026-11-21T05:00:00Z"));
  }

  @Test
  void a_short_day_ends_after_23_hours() {
    assertThat(at("2026-03-08T12:00:00Z", NY).todayEndsAt())
        .isEqualTo(Instant.parse("2026-03-09T04:00:00Z"));
  }

  @Test
  void a_long_day_ends_after_25_hours() {
    assertThat(at("2026-11-01T12:00:00Z", NY).todayEndsAt())
        .isEqualTo(Instant.parse("2026-11-02T05:00:00Z"));
  }

  @Test
  void the_last_day_of_the_month_in_the_zone() {
    assertThat(at("2026-12-01T03:00:00Z", NY).thisMonth()).isEqualTo(YearMonth.parse("2026-11"));
  }

  @Test
  void now_is_in_the_zone() {
    OrganizationCalendar calendar = at("2026-11-21T03:00:00Z", NY);
    assertThat(calendar.now().getZone()).isEqualTo(NY);
    assertThat(calendar.now().toInstant()).isEqualTo(Instant.parse("2026-11-21T03:00:00Z"));
    assertThat(calendar.zone()).isEqualTo(NY);
    assertThat(calendar.locale()).isEqualTo(Locale.US);
  }

  @Test
  void every_argument_is_required() {
    Clock clock = Clock.systemUTC();
    assertThatNullPointerException()
        .isThrownBy(() -> new OrganizationCalendar(null, NY, Locale.US))
        .withMessage("clock");
    assertThatNullPointerException()
        .isThrownBy(() -> new OrganizationCalendar(clock, null, Locale.US))
        .withMessage("zone");
    assertThatNullPointerException()
        .isThrownBy(() -> new OrganizationCalendar(clock, NY, null))
        .withMessage("locale");
  }
}
