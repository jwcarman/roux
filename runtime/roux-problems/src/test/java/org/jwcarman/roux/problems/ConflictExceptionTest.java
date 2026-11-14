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

class ConflictExceptionTest {

  @Test
  void formatsThePatternWithItsArguments() {
    assertThat(new ConflictException("The name %s is taken", "Ada"))
        .hasMessage("The name Ada is taken");
  }

  @Test
  void formatsTheSameWhateverTheServersLocale() {
    Locale before = Locale.getDefault();
    Locale.setDefault(Locale.GERMANY);
    try {
      assertThat(new ConflictException("Room %,d is booked", 1234567))
          .hasMessage("Room 1,234,567 is booked");
    } finally {
      Locale.setDefault(before);
    }
  }

  @Test
  void takesAPatternWithoutArgumentsAsIs() {
    assertThat(new ConflictException("100% booked")).hasMessage("100% booked");
  }
}
