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
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.Currency;
import java.util.List;
import java.util.stream.Stream;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Valid;
import jakarta.validation.Validator;
import jakarta.validation.constraints.NotNull;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.MethodSource;
import org.jwcarman.roux.money.InCurrency;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.PositiveMoney;
import org.jwcarman.roux.money.PositiveOrZeroMoney;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** Money as an app gets it from the starter: its JSON, {@code GET /api/money}, its constraints. */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
@Import(MoneyContractTest.PriceController.class)
class MoneyContractTest {

  @Autowired MockMvc mvc;
  @Autowired JsonMapper json;

  @Autowired Validator validator;

  record Positive(@PositiveMoney @InCurrency Money money) {}

  record PositiveOrZero(@PositiveOrZeroMoney @InCurrency Money money) {}

  static Stream<JsonNode> rules() {
    return Fixtures.read("money.json").get("rules").valueStream();
  }

  /** contracts/money.json's "rules": the server's answer, which money() in the browser matches. */
  @ParameterizedTest
  @MethodSource("rules")
  void everyRuleCaseGetsTheContractsMessage(JsonNode rule) {
    JsonNode money = rule.get("money");
    Money value =
        Money.of(
            money.get("minorUnits").asLong(),
            Currency.getInstance(money.get("currency").asString()));
    Object holder =
        rule.get("positive").asBoolean() ? new Positive(value) : new PositiveOrZero(value);
    List<String> messages =
        validator.validate(holder).stream().map(ConstraintViolation::getMessage).toList();

    if (rule.get("message").isNull()) {
      assertThat(messages).isEmpty();
    } else {
      assertThat(messages).containsExactly(rule.get("message").asString());
    }
  }

  record PriceRequest(@NotNull @PositiveMoney @InCurrency Money price) {}

  @RestController
  static class PriceController {
    @PostMapping("/api/test/prices")
    Money price(@Valid @RequestBody PriceRequest request) {
      return request.price();
    }
  }

  @Test
  void theAppsMapperWritesMinorUnitsAndACode() {
    assertThat(json.writeValueAsString(Money.of(15000, Currency.getInstance("USD"))))
        .isEqualTo("{\"minorUnits\":15000,\"currency\":\"USD\"}");
  }

  @Test
  void signedInGetsTheCurrency() throws Exception {
    mvc.perform(get("/api/money").with(user("someone")))
        .andExpect(status().isOk())
        .andExpect(content().json("{\"currency\":\"USD\",\"fractionDigits\":2}", true));
  }

  @Test
  void signedOutIsRefused() throws Exception {
    mvc.perform(get("/api/money")).andExpect(status().isUnauthorized());
  }

  @Test
  void aPriceInTheCurrencyIsAccepted() throws Exception {
    mvc.perform(
            post("/api/test/prices")
                .with(user("someone"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"price\":{\"minorUnits\":15000,\"currency\":\"USD\"}}"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.minorUnits").value(15000));
  }

  @Test
  void aZeroPriceInAnotherCurrencyIsTwoFieldErrors() throws Exception {
    mvc.perform(
            post("/api/test/prices")
                .with(user("someone"))
                .with(csrf())
                .contentType(MediaType.APPLICATION_JSON)
                .content("{\"price\":{\"minorUnits\":0,\"currency\":\"EUR\"}}"))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'price')].message")
                .value(containsInAnyOrder("Must be more than 0", "Must be in USD")));
  }
}
