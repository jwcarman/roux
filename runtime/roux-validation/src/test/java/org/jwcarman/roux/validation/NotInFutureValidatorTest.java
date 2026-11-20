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
package org.jwcarman.roux.validation;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Locale;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

class NotInFutureValidatorTest {

  private static NotInFutureValidator at(String instant, String zone) {
    StaticListableBeanFactory beans = new StaticListableBeanFactory();
    beans.addBean(
        "calendar",
        new OrganizationCalendar(
            Clock.fixed(Instant.parse(instant), ZoneOffset.UTC), ZoneId.of(zone), Locale.US));
    return new NotInFutureValidator(beans.getBeanProvider(OrganizationCalendar.class));
  }

  @Test
  void tomorrowIsInTheFutureWithACalendar() {
    // 03:00 UTC on the 21st is still the 20th in New York.
    NotInFutureValidator validator = at("2026-11-21T03:00:00Z", "America/New_York");

    assertThat(validator.isValid(LocalDate.parse("1996-11-20"), null)).isTrue();
    assertThat(validator.isValid(LocalDate.parse("2026-11-20"), null)).isTrue();
    assertThat(validator.isValid(LocalDate.parse("2026-11-21"), null)).isFalse();
  }

  @Test
  void aZoneAheadOfUtcAcceptsItsToday() {
    NotInFutureValidator validator = at("2026-11-20T12:00:00Z", "Pacific/Auckland");

    assertThat(validator.isValid(LocalDate.parse("2026-11-21"), null)).isTrue();
    assertThat(validator.isValid(LocalDate.parse("2026-11-22"), null)).isFalse();
  }

  @Test
  void noDateIsLeftToNotNull() {
    assertThat(at("2026-11-20T12:00:00Z", "UTC").isValid(null, null)).isTrue();
  }

  @Test
  void withoutACalendarTomorrowIsAllowed() {
    NotInFutureValidator validator =
        new NotInFutureValidator(
            new StaticListableBeanFactory().getBeanProvider(OrganizationCalendar.class));

    assertThat(validator.isValid(LocalDate.now().plusDays(1), null)).isTrue();
    assertThat(validator.isValid(LocalDate.now().plusDays(3), null)).isFalse();
  }

  @Test
  void builtWithoutSpringTomorrowIsAllowed() {
    NotInFutureValidator validator = new NotInFutureValidator();

    assertThat(validator.isValid(LocalDate.now().plusDays(1), null)).isTrue();
    assertThat(validator.isValid(LocalDate.now().plusDays(3), null)).isFalse();
  }
}
