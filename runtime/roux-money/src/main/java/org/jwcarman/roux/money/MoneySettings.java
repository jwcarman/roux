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
package org.jwcarman.roux.money;

import java.util.Currency;
import java.util.Objects;

import com.fasterxml.jackson.annotation.JsonProperty;

/**
 * The app's one currency, from {@code roux.money.currency}. The browser gets it in the
 * organization's context ({@code GET /api/organization}), with its {@code fractionDigits}.
 *
 * @param currency the currency every amount in the app is in
 */
public record MoneySettings(Currency currency) {

  /**
   * Checks the currency is set.
   *
   * @throws NullPointerException if {@code currency} is null
   */
  public MoneySettings {
    Objects.requireNonNull(currency, "currency");
  }

  /**
   * How many minor-unit digits the currency has (2 for USD, 0 for JPY).
   *
   * @return the digits after the decimal point
   */
  @JsonProperty
  public int fractionDigits() {
    return currency.getDefaultFractionDigits();
  }
}
