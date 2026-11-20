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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validator;

import org.junit.jupiter.api.Test;
import org.jwcarman.roux.organization.OrganizationCalendar;
import org.jwcarman.roux.validation.NotInFuture;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;

/** The organization as an app gets it from the starter: {@code GET /api/organization}. */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class OrganizationContractTest {

  @Autowired MockMvc mvc;
  @Autowired Validator validator;
  @Autowired OrganizationCalendar calendar;

  record Taken(@NotInFuture LocalDate on) {}

  @Test
  void notInFutureIsTheOrganizationsToday() {
    assertThat(validator.validate(new Taken(calendar.today()))).isEmpty();
    assertThat(validator.validate(new Taken(calendar.today().plusDays(1))))
        .extracting(ConstraintViolation::getMessage)
        .containsExactly("Must not be in the future");
  }

  @Test
  void signedOutGetsTheOrganizationsContext() throws Exception {
    mvc.perform(get("/api/organization"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.timeZone").value("America/New_York"))
        .andExpect(jsonPath("$.locale").value("en-US"))
        .andExpect(jsonPath("$.currency").value("USD"))
        .andExpect(jsonPath("$.fractionDigits").value(2))
        .andExpect(jsonPath("$.today").isString())
        .andExpect(jsonPath("$.todayEndsAt").isString());
  }
}
