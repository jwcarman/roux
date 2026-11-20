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

import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;

import org.hibernate.validator.constraintvalidation.HibernateConstraintValidatorContext;
import org.jspecify.annotations.Nullable;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.beans.factory.annotation.Autowired;

/** Checks {@link InCurrency} against the app's {@link MoneySettings}. */
public class InCurrencyValidator implements ConstraintValidator<InCurrency, Money> {

  private final Currency currency;

  /**
   * Built by Spring with the app's settings.
   *
   * @param settings the app's currency
   * @throws IllegalStateException if {@code roux.money.currency} is not set
   */
  @Autowired
  public InCurrencyValidator(ObjectProvider<MoneySettings> settings) {
    MoneySettings found = settings.getIfAvailable();
    if (found == null) {
      throw new IllegalStateException("roux.money.currency must be set to check @InCurrency");
    }
    this.currency = found.currency();
  }

  @Override
  public boolean isValid(@Nullable Money value, ConstraintValidatorContext context) {
    context
        .unwrap(HibernateConstraintValidatorContext.class)
        .addMessageParameter("currency", currency.getCurrencyCode());
    return value == null || value.currency().equals(currency);
  }
}
