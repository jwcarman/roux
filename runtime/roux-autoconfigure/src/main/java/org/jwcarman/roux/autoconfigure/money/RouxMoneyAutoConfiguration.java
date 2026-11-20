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

import java.util.Objects;

import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.MoneyController;
import org.jwcarman.roux.money.MoneySettings;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.autoconfigure.condition.ConditionalOnClass;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication;
import org.springframework.boot.autoconfigure.condition.ConditionalOnWebApplication.Type;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;

/**
 * Money, once {@code roux.money.currency} names the app's currency: {@link MoneySettings} (which
 * {@code @InCurrency} checks against) and {@code GET /api/money}.
 */
@AutoConfiguration
@ConditionalOnClass(Money.class)
@ConditionalOnProperty("roux.money.currency")
@EnableConfigurationProperties(RouxMoneyProperties.class)
public class RouxMoneyAutoConfiguration {

  /**
   * The app's currency.
   *
   * @param money {@code roux.money.*}
   * @return the settings
   */
  @Bean
  @ConditionalOnMissingBean
  public MoneySettings rouxMoneySettings(RouxMoneyProperties money) {
    return new MoneySettings(Objects.requireNonNull(money.currency()));
  }

  /**
   * {@code GET /api/money}.
   *
   * @param settings the app's currency
   * @return the controller
   */
  @Bean
  @ConditionalOnMissingBean
  @ConditionalOnWebApplication(type = Type.SERVLET)
  public MoneyController rouxMoneyController(MoneySettings settings) {
    return new MoneyController(settings);
  }
}
