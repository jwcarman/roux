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

import java.time.LocalDate;
import java.util.function.Supplier;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import org.jspecify.annotations.Nullable;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;

/**
 * Checks {@link NotInFuture}. In a roux app, Spring builds it with the {@link
 * OrganizationCalendar}, and a date after the organization's today is in the future. Outside a roux
 * app (no calendar, or built without Spring) it falls back to the server's zone with a day's
 * allowance, since the server and the person's browser may then disagree on today.
 */
public class NotInFutureValidator implements ConstraintValidator<NotInFuture, LocalDate> {

  private final Supplier<LocalDate> latest;

  /** Built by Spring: the organization's today, or the fallback without a calendar. */
  @Autowired
  public NotInFutureValidator(ObjectProvider<OrganizationCalendar> calendar) {
    OrganizationCalendar organization = calendar.getIfAvailable();
    this.latest = organization == null ? NotInFutureValidator::fallback : organization::today;
  }

  /** Built without Spring: the fallback. */
  public NotInFutureValidator() {
    this.latest = NotInFutureValidator::fallback;
  }

  private static LocalDate fallback() {
    return LocalDate.now().plusDays(1);
  }

  @Override
  public boolean isValid(@Nullable LocalDate value, ConstraintValidatorContext context) {
    return value == null || !value.isAfter(latest.get());
  }
}
