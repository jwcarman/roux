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
package org.jwcarman.roux.autoconfigure.money;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Currency;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.money.MoneySettings;
import org.springframework.boot.autoconfigure.AutoConfigurations;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxMoneyAutoConfigurationTest {

  private final ApplicationContextRunner runner =
      new ApplicationContextRunner()
          .withConfiguration(AutoConfigurations.of(RouxMoneyAutoConfiguration.class));

  @Test
  void the_currency_setting_gives_the_settings() {
    runner
        .withPropertyValues("roux.money.currency=USD")
        .run(
            context ->
                assertThat(context.getBean(MoneySettings.class).currency())
                    .isEqualTo(Currency.getInstance("USD")));
  }

  @Test
  void without_the_setting_money_is_unused() {
    runner.run(context -> assertThat(context).doesNotHaveBean(MoneySettings.class));
  }

  @Test
  void an_unknown_currency_fails_startup() {
    runner
        .withPropertyValues("roux.money.currency=ZZZ")
        .run(context -> assertThat(context).hasFailed());
  }
}
