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

import static org.assertj.core.api.Assertions.assertThat;

import java.util.Locale;

import org.junit.jupiter.api.Test;

class InvariantViolationExceptionTest {

  @Test
  void formatsThePatternWithItsArguments() {
    assertThat(new InvariantViolationException("%s has %d skills", "White", 7))
        .hasMessage("White has 7 skills");
  }

  @Test
  void formatsTheSameWhateverTheServersLocale() {
    Locale before = Locale.getDefault();
    Locale.setDefault(Locale.GERMANY);
    try {
      assertThat(new InvariantViolationException("At most %,d rows", 1234567))
          .hasMessage("At most 1,234,567 rows");
    } finally {
      Locale.setDefault(before);
    }
  }

  @Test
  void takesAPatternWithoutArgumentsAsIs() {
    assertThat(new InvariantViolationException("100% sure")).hasMessage("100% sure");
  }

  @Test
  void anInvalidFieldIsAnInvariantViolationThatNamesItsField() {
    InvalidFieldException exception =
        new InvalidFieldException("note", "Must be at most %d characters", 500);

    assertThat(exception)
        .isInstanceOf(InvariantViolationException.class)
        .hasMessage("Must be at most 500 characters");
    assertThat(exception.getField()).isEqualTo("note");
  }
}
