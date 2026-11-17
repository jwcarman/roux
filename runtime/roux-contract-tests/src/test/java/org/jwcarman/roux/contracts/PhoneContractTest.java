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
package org.jwcarman.roux.contracts;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.stream.Stream;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;
import jakarta.validation.ValidatorFactory;

import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.jwcarman.roux.validation.Phone;

import tools.jackson.databind.JsonNode;

/**
 * {@code @Phone} and the browser's {@code phone()} are one rule: the same pattern and the same
 * message, and the same answer for every example in {@code contracts/phone.json}, which roux-web's
 * tests check against {@code phone()}.
 */
class PhoneContractTest {

  record Holder(@Phone String phone) {}

  private static final JsonNode CONTRACT = Fixtures.read("phone.json");
  private static final ValidatorFactory FACTORY = Validation.buildDefaultValidatorFactory();
  private static final Validator VALIDATOR = FACTORY.getValidator();

  @AfterAll
  static void close() {
    FACTORY.close();
  }

  static Stream<String> valid() {
    return CONTRACT.get("valid").valueStream().map(JsonNode::asString);
  }

  static Stream<String> invalid() {
    return CONTRACT.get("invalid").valueStream().map(JsonNode::asString);
  }

  @Test
  void thePatternIsTheContracts() {
    assertThat(Phone.PATTERN).isEqualTo(CONTRACT.get("pattern").asString());
  }

  @ParameterizedTest
  @MethodSource("valid")
  void everyValidExampleIsAccepted(String phone) {
    assertThat(VALIDATOR.validate(new Holder(phone))).isEmpty();
  }

  @ParameterizedTest
  @MethodSource("invalid")
  void everyInvalidExampleIsRefusedWithTheContractsMessage(String phone) {
    List<String> messages =
        VALIDATOR.validate(new Holder(phone)).stream()
            .map(ConstraintViolation::getMessage)
            .toList();

    assertThat(messages).containsExactly(CONTRACT.get("message").asString());
  }
}
