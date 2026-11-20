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

import java.time.Instant;
import java.time.LocalDate;
import java.util.Currency;

import org.jspecify.annotations.Nullable;

/**
 * What the browser is told about the organization, in the page ({@code #app-context}) and at {@code
 * GET /api/organization}: its zone, its locale, today, when today ends, and its currency with that
 * currency's digits ({@code null} when the app has no {@code roux.money.currency}).
 *
 * @param timeZone the organization's IANA time zone
 * @param locale the organization's locale, as a BCP 47 tag
 * @param today the organization's date today
 * @param todayEndsAt when today ends, the moment the browser asks for the new day
 * @param currency the app's ISO 4217 currency, or {@code null}
 * @param fractionDigits the currency's digits, or {@code null}
 */
public record OrganizationContext(
    String timeZone,
    String locale,
    LocalDate today,
    Instant todayEndsAt,
    @Nullable String currency,
    @Nullable Integer fractionDigits) {

  /** The context now, from the calendar and the app's currency ({@code null} for none). */
  public static OrganizationContext of(OrganizationCalendar calendar, @Nullable Currency currency) {
    return new OrganizationContext(
        calendar.zone().getId(),
        calendar.locale().toLanguageTag(),
        calendar.today(),
        calendar.todayEndsAt(),
        currency == null ? null : currency.getCurrencyCode(),
        currency == null ? null : currency.getDefaultFractionDigits());
  }
}
