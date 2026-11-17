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
package org.jwcarman.roux.problems.constraints;

import static java.lang.annotation.ElementType.ANNOTATION_TYPE;
import static java.lang.annotation.ElementType.CONSTRUCTOR;
import static java.lang.annotation.ElementType.FIELD;
import static java.lang.annotation.ElementType.METHOD;
import static java.lang.annotation.ElementType.PARAMETER;
import static java.lang.annotation.ElementType.RECORD_COMPONENT;
import static java.lang.annotation.ElementType.TYPE_USE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A phone number: digits, spaces and {@code + - ( ) .}, with at least 7 digits. The browser's
 * {@code phone()} rule in roux-web checks the same pattern with the same message, and a contract
 * test holds the two together ({@code contracts/phone.json}). {@code null} and blank are valid, as
 * for every constraint here: leave "required" to {@code @NotBlank}, which reports a blank value
 * alone.
 */
@Documented
@Constraint(validatedBy = PhoneValidator.class)
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, RECORD_COMPONENT, TYPE_USE})
@Retention(RUNTIME)
public @interface Phone {

  /** What a phone number looks like, as a regular expression both Java and JavaScript read. */
  String PATTERN = "^(?=(?:\\D*\\d){7})[\\d +\\-().]+$";

  String message() default "{org.jwcarman.roux.problems.constraints.Phone.message}";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}
