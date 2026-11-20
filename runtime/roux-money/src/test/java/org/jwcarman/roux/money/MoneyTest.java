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

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatExceptionOfType;
import static org.assertj.core.api.Assertions.assertThatIllegalArgumentException;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;

import java.util.Currency;
import java.util.Locale;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

import tools.jackson.databind.DatabindException;
import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class MoneyTest {

  private static final Currency USD = Currency.getInstance("USD");
  private static final Currency EUR = Currency.getInstance("EUR");

  @Test
  void times_multiplies_the_minor_units() {
    assertThat(Money.of(15000, USD).times(3)).isEqualTo(Money.of(45000, USD));
  }

  @Test
  void times_refuses_to_overflow() {
    assertThatExceptionOfType(ArithmeticException.class)
        .isThrownBy(() -> Money.of(Long.MAX_VALUE, USD).times(2));
  }

  @Test
  void plus_adds_the_same_currency() {
    assertThat(Money.of(100, USD).plus(Money.of(50, USD))).isEqualTo(Money.of(150, USD));
  }

  @Test
  void plus_refuses_another_currency() {
    assertThatIllegalArgumentException()
        .isThrownBy(() -> Money.of(100, USD).plus(Money.of(1, EUR)))
        .withMessage("Cannot add EUR to USD");
  }

  @Test
  void plus_refuses_to_overflow() {
    assertThatExceptionOfType(ArithmeticException.class)
        .isThrownBy(() -> Money.of(Long.MAX_VALUE, USD).plus(Money.of(1, USD)));
  }

  @Test
  void zero_has_no_minor_units() {
    assertThat(Money.zero(USD)).isEqualTo(Money.of(0, USD));
  }

  @Test
  void is_positive_only_above_zero() {
    assertThat(Money.of(1, USD).isPositive()).isTrue();
    assertThat(Money.of(0, USD).isPositive()).isFalse();
    assertThat(Money.of(-1, USD).isPositive()).isFalse();
  }

  @Test
  void a_currency_is_required() {
    assertThatNullPointerException().isThrownBy(() -> Money.of(1, null));
  }

  @Test
  void json_is_minor_units_and_a_currency_code() {
    JsonMapper json = JsonMapper.builder().build();
    String text = "{\"minorUnits\":15000,\"currency\":\"USD\"}";

    assertThat(json.writeValueAsString(Money.of(15000, USD))).isEqualTo(text);
    assertThat(json.readValue(text, Money.class)).isEqualTo(Money.of(15000, USD));
  }

  @Test
  void settings_give_the_currency_digits() {
    assertThat(new MoneySettings(USD).fractionDigits()).isEqualTo(2);
    assertThat(new MoneySettings(Currency.getInstance("JPY")).fractionDigits()).isZero();
  }

  @Test
  void settings_json_carries_the_digits() {
    assertThat(JsonMapper.builder().build().writeValueAsString(new MoneySettings(USD)))
        .isEqualTo("{\"currency\":\"USD\",\"fractionDigits\":2}");
  }

  @Test
  void settings_require_a_currency() {
    assertThatNullPointerException().isThrownBy(() -> new MoneySettings(null));
  }

  @Test
  void formats_in_a_locale_with_the_currencys_digits() {
    assertThat(Money.of(15000, Currency.getInstance("USD")).format(Locale.US)).isEqualTo("$150.00");
    assertThat(Money.of(-5, Currency.getInstance("USD")).format(Locale.US)).isEqualTo("-$0.05");
    assertThat(Money.of(1500, Currency.getInstance("JPY")).format(Locale.JAPAN))
        .isEqualTo("￥1,500");
    assertThat(Money.of(123456, Currency.getInstance("EUR")).format(Locale.GERMANY))
        .isEqualTo("1.234,56\u00a0€");
  }

  @Test
  void json_refuses_a_fractional_or_missing_amount() {
    JsonMapper json = JsonMapper.builder().build();
    assertThatExceptionOfType(DatabindException.class)
        .isThrownBy(
            () -> json.readValue("{\"minorUnits\":150.5,\"currency\":\"USD\"}", Money.class));
    assertThatExceptionOfType(DatabindException.class)
        .isThrownBy(() -> json.readValue("{\"currency\":\"USD\"}", Money.class));
    assertThat(json.readValue("{\"minorUnits\":150.0,\"currency\":\"USD\"}", Money.class))
        .isEqualTo(Money.of(150, USD));
    assertThat(json.readValue("{\"minorUnits\":7,\"currency\":\"USD\"}", Money.class))
        .isEqualTo(Money.of(7, USD));
  }

  @Test
  void formats_a_currency_the_locale_does_not_use_with_that_currencys_digits() {
    assertThat(Money.of(123456, Currency.getInstance("EUR")).format(Locale.US))
        .isEqualTo("€1,234.56");
    assertThat(Money.of(123456, Currency.getInstance("JPY")).format(Locale.US))
        .isEqualTo("¥123,456");
    assertThat(Money.of(123456, Currency.getInstance("BHD")).format(Locale.US))
        .isEqualTo("BHD123.456");
  }
}
