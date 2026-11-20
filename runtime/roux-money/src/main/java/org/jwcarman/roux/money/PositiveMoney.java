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

import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.RECORD_COMPONENT;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A {@link Money} more than zero: {@code Must be more than 0}, as the browser's {@code
 * money(...).positive()} says. Null is left to {@code @NotNull}.
 */
@Documented
@Constraint(validatedBy = PositiveMoneyValidator.class)
@Target({FIELD, PARAMETER, RECORD_COMPONENT})
@Retention(RUNTIME)
public @interface PositiveMoney {

  /**
   * The message.
   *
   * @return its key
   */
  String message() default "{org.jwcarman.roux.money.PositiveMoney.message}";

  /**
   * The groups.
   *
   * @return none by default
   */
  Class<?>[] groups() default {};

  /**
   * The payload.
   *
   * @return none by default
   */
  Class<? extends Payload>[] payload() default {};
}
