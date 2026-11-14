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

import java.util.Locale;

/**
 * A request that clashes with the state the server holds ("The name Ada is taken"), answered by
 * {@code ProblemsAdvice} as a 409 whose {@code detail} is the message.
 *
 * <p>The message is formatted as {@link InvariantViolationException}'s is: {@code
 * String.format(Locale.ROOT, pattern, args)}, so it reads the same whatever the server's locale.
 * Without arguments the pattern is the message as it stands, so a {@code %} in it needs no
 * escaping.
 */
public class ConflictException extends RuntimeException {

  private static final long serialVersionUID = 1L;

  /**
   * Creates the exception.
   *
   * @param pattern what clashes, for the user, as a {@link String#format} pattern
   * @param args the pattern's arguments
   */
  public ConflictException(String pattern, Object... args) {
    super(args.length == 0 ? pattern : String.format(Locale.ROOT, pattern, args));
  }
}
