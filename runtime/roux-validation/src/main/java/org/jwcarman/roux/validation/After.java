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
import static java.lang.annotation.ElementType.TYPE;
import static java.lang.annotation.RetentionPolicy.RUNTIME;

import java.lang.annotation.Documented;
import java.lang.annotation.Repeatable;
import java.lang.annotation.Retention;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;

/**
 * A rule across two fields of a request: {@code field} must be after {@code other}, such as a class
 * that ends after it starts. It goes on the record or class, and the violation is a field error on
 * {@code field}, so a form shows it under the later field:
 *
 * <pre>{@code
 * @After(field = "endsAt", other = "startsAt")
 * public record ClassRequest(@NotNull LocalTime startsAt, @NotNull LocalTime endsAt) {}
 * }</pre>
 *
 * <p>The two fields hold the same type of {@link Comparable} ({@code LocalTime}, {@code LocalDate},
 * {@code Instant}, a number, ...); equal is not after. A {@code null} in either is valid: leave
 * "required" to {@code @NotNull}. A field that does not exist, or two that cannot be compared, is a
 * bug in the request and throws instead of passing.
 *
 * <p>The message is {@code Must be after {other}}, where {@code {other}} is {@link #otherLabel}, or
 * the other field's name as words ({@code startsAt} is {@code starts at}). The browser's {@code
 * after(schema, { field, other })} in roux-web says the same words; give both the same label.
 */
@Documented
@Constraint(validatedBy = AfterValidator.class)
@Target({TYPE, ANNOTATION_TYPE})
@Retention(RUNTIME)
@Repeatable(After.List.class)
public @interface After {

  /** The later field, which the violation is reported on. */
  String field();

  /** The earlier field. */
  String other();

  /** What the earlier field is called in the message, such as {@code the start time}. */
  String otherLabel() default "";

  String message() default "{org.jwcarman.roux.validation.After.message}";

  Class<?>[] groups() default {};

  Class<? extends Payload>[] payload() default {};

  /** Several {@code @After} on one type. */
  @Documented
  @Target({TYPE, ANNOTATION_TYPE})
  @Retention(RUNTIME)
  @interface List {
    After[] value();
  }
}
