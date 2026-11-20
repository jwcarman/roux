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
import static org.assertj.core.api.Assertions.assertThatIllegalStateException;

import java.util.Currency;
import java.util.List;
import java.util.Map;

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorFactory;
import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.support.StaticListableBeanFactory;

@DisplayNameGeneration(ReplaceUnderscores.class)
class MoneyValidatorsTest {

  private static final Currency USD = Currency.getInstance("USD");

  record Price(@PositiveMoney @InCurrency Money price) {}

  record Fee(@PositiveOrZeroMoney Money fee) {}

  /** Builds InCurrencyValidator as Spring would, with the app's settings. */
  private static final class WithSettings implements ConstraintValidatorFactory {
    private final ConstraintValidatorFactory defaults =
        Validation.byDefaultProvider().configure().getDefaultConstraintValidatorFactory();

    @Override
    public <T extends ConstraintValidator<?, ?>> T getInstance(Class<T> key) {
      if (key == InCurrencyValidator.class) {
        return key.cast(new InCurrencyValidator(settings(new MoneySettings(USD))));
      }
      return defaults.getInstance(key);
    }

    @Override
    public void releaseInstance(ConstraintValidator<?, ?> instance) {
      defaults.releaseInstance(instance);
    }
  }

  private static final ValidatorFactory FACTORY =
      Validation.byDefaultProvider()
          .configure()
          .constraintValidatorFactory(new WithSettings())
          .buildValidatorFactory();
  private static final Validator VALIDATOR = FACTORY.getValidator();

  @AfterAll
  static void close() {
    FACTORY.close();
  }

  private static ObjectProvider<MoneySettings> settings(MoneySettings... settings) {
    StaticListableBeanFactory beans =
        new StaticListableBeanFactory(
            settings.length == 0 ? Map.of() : Map.of("moneySettings", settings[0]));
    return beans.getBeanProvider(MoneySettings.class);
  }

  private static <T> List<String> messages(T value) {
    return VALIDATOR.validate(value).stream().map(ConstraintViolation::getMessage).toList();
  }

  @Test
  void zero_is_not_more_than_zero() {
    assertThat(messages(new Price(Money.of(0, USD)))).containsExactly("Must be more than 0");
  }

  @Test
  void a_positive_amount_in_the_currency_passes() {
    assertThat(messages(new Price(Money.of(1, USD)))).isEmpty();
  }

  @Test
  void another_currency_names_the_apps() {
    assertThat(messages(new Price(Money.of(100, Currency.getInstance("EUR")))))
        .containsExactly("Must be in USD");
  }

  @Test
  void a_negative_fee_is_refused() {
    assertThat(messages(new Fee(Money.of(-1, USD)))).containsExactly("Must not be negative");
  }

  @Test
  void a_zero_fee_passes() {
    assertThat(messages(new Fee(Money.of(0, USD)))).isEmpty();
  }

  @Test
  void null_is_left_to_not_null() {
    assertThat(messages(new Price(null))).isEmpty();
    assertThat(messages(new Fee(null))).isEmpty();
  }

  @Test
  void in_currency_needs_the_apps_currency() {
    assertThatIllegalStateException()
        .isThrownBy(() -> new InCurrencyValidator(settings()))
        .withMessage("roux.money.currency must be set to check @InCurrency");
  }
}
