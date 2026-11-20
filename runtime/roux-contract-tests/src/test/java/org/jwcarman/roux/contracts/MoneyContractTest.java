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

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.money.InCurrency;
import org.jwcarman.roux.money.Money;
import org.jwcarman.roux.money.PositiveMoney;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Import;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RestController;

import tools.jackson.databind.json.JsonMapper;

/** Money as an app gets it from the starter: its JSON, {@code GET /api/money}, its constraints. */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
@Import(MoneyContractTest.PriceController.class)
class MoneyContractTest {

  @Autowired MockMvc mvc;
  @Autowired JsonMapper json;

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
