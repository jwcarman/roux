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

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.junit.jupiter.api.Test;

/** Hibernate Validator finds roux's bundle on the class path, beside any of the application's. */
class ValidationMessagesTest {

  private record Form(
      @NotBlank String name,
      @Size(min = 2, max = 5) String code,
      @Phone String phone,
      @NotInFuture LocalDate day) {}

  private final Validator validator = Validation.buildDefaultValidatorFactory().getValidator();

  @Test
  void aStandardConstraintIsWordedForThePersonFillingInTheForm() {
    Set<ConstraintViolation<Form>> violations =
        validator.validate(new Form("", "abcdefgh", "not a phone", LocalDate.now().plusDays(3)));

    List<String> messages = violations.stream().map(ConstraintViolation::getMessage).toList();
    assertThat(messages)
        .containsExactlyInAnyOrder(
            "Must not be blank",
            "Must be between 2 and 5 characters",
            "Is not in the expected format",
            "Must not be in the future");
  }
}
