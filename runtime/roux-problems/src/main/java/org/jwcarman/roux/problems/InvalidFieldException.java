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
package org.jwcarman.roux.problems;

/**
 * A rule about one field that Bean Validation cannot state, such as a date that must not be in the
 * future relative to the app's clock, or a choice that must belong to a list the server holds.
 * Answered like a constraint violation: a 400 whose {@code errors} names the field.
 */
public class InvalidFieldException extends InvariantViolationException {

  private final String field;

  /**
   * Creates the exception.
   *
   * @param field the field as the client sent it, such as {@code dateOfBirth}
   * @param pattern what is wrong, for the user, as {@link InvariantViolationException} formats it
   * @param args the pattern's arguments
   */
  public InvalidFieldException(String field, String pattern, Object... args) {
    super(pattern, args);
    this.field = field;
  }

  /** The field as the client sent it. */
  public String getField() {
    return field;
  }
}
