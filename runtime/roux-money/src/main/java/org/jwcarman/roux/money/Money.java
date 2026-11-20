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

import jakarta.persistence.Embeddable;

import com.fasterxml.jackson.annotation.JsonIgnore;

/**
 * An amount of money: whole minor units of its currency (cents for USD, yen for JPY), never a
 * floating-point number. On the wire it is {@code {"minorUnits": 15000, "currency": "USD"}}; in a
 * table, two columns, {@code <name>_minor_units} and {@code <name>_currency}, named by the entity's
 * {@code @AttributeOverride}s.
 *
 * @param minorUnits the amount in the currency's minor units
 * @param currency the currency (required)
 */
@Embeddable
public record Money(long minorUnits, Currency currency) {

  /**
   * Checks the currency is set.
   *
   * @throws NullPointerException if {@code currency} is null
   */
  public Money {
    Objects.requireNonNull(currency, "currency");
  }

  /**
   * An amount.
   *
   * @param minorUnits the amount in minor units
   * @param currency its currency
   * @return the money
   */
  public static Money of(long minorUnits, Currency currency) {
    return new Money(minorUnits, currency);
  }

  /**
   * No money in {@code currency}.
   *
   * @param currency the currency
   * @return zero in it
   */
  public static Money zero(Currency currency) {
    return new Money(0, currency);
  }

  /**
   * This amount {@code n} times (a price for {@code n} periods).
   *
   * @param n how many times
   * @return the product
   * @throws ArithmeticException if it overflows
   */
  public Money times(int n) {
    return new Money(Math.multiplyExact(minorUnits, n), currency);
  }

  /**
   * This amount plus {@code other}.
   *
   * @param other an amount in the same currency
   * @return the sum
   * @throws IllegalArgumentException if {@code other} is in another currency
   * @throws ArithmeticException if it overflows
   */
  public Money plus(Money other) {
    if (!currency.equals(other.currency)) {
      throw new IllegalArgumentException(
          "Cannot add " + other.currency.getCurrencyCode() + " to " + currency.getCurrencyCode());
    }
    return new Money(Math.addExact(minorUnits, other.minorUnits), currency);
  }

  /**
   * Whether this is more than zero.
   *
   * @return true above zero
   */
  @JsonIgnore
  public boolean isPositive() {
    return minorUnits > 0;
  }
}
