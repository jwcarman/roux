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
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

class NotInFutureValidatorTest {

  private static final Clock CLOCK =
      Clock.fixed(Instant.parse("2026-06-15T23:30:00Z"), ZoneOffset.UTC);
  private static final LocalDate TODAY = LocalDate.of(2026, 6, 15);

  private static NotInFutureValidator withClock() {
    StaticListableBeanFactory beans = new StaticListableBeanFactory();
    beans.addBean("clock", CLOCK);
    return new NotInFutureValidator(beans.getBeanProvider(Clock.class));
  }

  @Test
  void aDayUpToTomorrowIsAllowed() {
    NotInFutureValidator validator = withClock();

    assertThat(validator.isValid(TODAY.minusYears(30), null)).isTrue();
    assertThat(validator.isValid(TODAY, null)).isTrue();
    assertThat(validator.isValid(TODAY.plusDays(1), null)).isTrue();
  }

  @Test
  void theDayAfterTomorrowIsInTheFuture() {
    assertThat(withClock().isValid(TODAY.plusDays(2), null)).isFalse();
  }

  @Test
  void noDateIsLeftToNotNull() {
    assertThat(withClock().isValid(null, null)).isTrue();
  }

  @Test
  void withoutAClockBeanItUsesTheSystemClock() {
    NotInFutureValidator validator =
        new NotInFutureValidator(new StaticListableBeanFactory().getBeanProvider(Clock.class));

    assertThat(validator.isValid(LocalDate.now(), null)).isTrue();
    assertThat(validator.isValid(LocalDate.now().plusDays(3), null)).isFalse();
  }

  @Test
  void builtWithoutSpringItUsesTheSystemClock() {
    NotInFutureValidator validator = new NotInFutureValidator();

    assertThat(validator.isValid(LocalDate.now(), null)).isTrue();
    assertThat(validator.isValid(LocalDate.now().plusDays(3), null)).isFalse();
  }
}
