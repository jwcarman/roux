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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class PhoneValidatorTest {

  private final PhoneValidator validator = new PhoneValidator();

  @ParameterizedTest
  @ValueSource(strings = {"555 1234", "+1 (555) 123-4567", "555.123.4567", "(0)12-3456-789"})
  void digitsSpacesAndPunctuationWithSevenDigitsAreValid(String phone) {
    assertThat(validator.isValid(phone, null)).isTrue();
  }

  @ParameterizedTest
  @ValueSource(strings = {"call me", "555-12", "555 1234\n", "555\t1234", "555 1234x", "١٢٣٤٥٦٧"})
  void anythingElseIsNot(String phone) {
    assertThat(validator.isValid(phone, null)).isFalse();
  }

  @ParameterizedTest
  @ValueSource(strings = {"", "   "})
  void aBlankValueIsLeftToNotBlank(String phone) {
    assertThat(validator.isValid(phone, null)).isTrue();
  }

  @Test
  void noValueIsLeftToNotNull() {
    assertThat(validator.isValid(null, null)).isTrue();
  }
}
