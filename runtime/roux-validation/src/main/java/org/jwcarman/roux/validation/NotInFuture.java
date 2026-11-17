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
package org.jwcarman.roux.validation;

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
 * A {@code LocalDate} that is not in the future, for a date a person picks in a browser (a birth
 * date, the day something happened). It compares with today by the application's {@link
 * java.time.Clock} bean (the system clock when there is none) and allows one day past the server's
 * today: a browser can be up to UTC+14, ahead of the server's zone, and its "today" must not be
 * refused. The browser's {@code date().notInFuture()} in roux-web says the same words, comparing
 * with the browser's own today. {@code null} is valid; leave "required" to {@code @NotNull}.
 *
 * <p>Use it in place of {@code @PastOrPresent}, which compares with the server's exact today.
 */
@Documented
@Constraint(validatedBy = NotInFutureValidator.class)
@Target({METHOD, FIELD, ANNOTATION_TYPE, CONSTRUCTOR, PARAMETER, RECORD_COMPONENT, TYPE_USE})
@Retention(RUNTIME)
public @interface NotInFuture {

  String message() default "{org.jwcarman.roux.validation.NotInFuture.message}";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};
}
