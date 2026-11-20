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
package org.jwcarman.roux.organization;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.Currency;
import java.util.Locale;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

import tools.jackson.databind.json.JsonMapper;

@DisplayNameGeneration(ReplaceUnderscores.class)
class OrganizationContextTest {

  private static final OrganizationCalendar CALENDAR =
      new OrganizationCalendar(
          Clock.fixed(Instant.parse("2026-11-20T15:00:00Z"), ZoneOffset.UTC),
          ZoneId.of("America/New_York"),
          Locale.forLanguageTag("en-US"));

  private final JsonMapper json = JsonMapper.builder().build();

  @Test
  void the_context_with_a_currency() {
    assertThat(
            json.writeValueAsString(OrganizationContext.of(CALENDAR, Currency.getInstance("USD"))))
        .isEqualTo(
            "{\"timeZone\":\"America/New_York\",\"locale\":\"en-US\",\"today\":\"2026-11-20\","
                + "\"todayEndsAt\":\"2026-11-21T05:00:00Z\",\"currency\":\"USD\",\"fractionDigits\":2}");
  }

  @Test
  void the_context_without_a_currency() {
    assertThat(json.writeValueAsString(OrganizationContext.of(CALENDAR, null)))
        .endsWith("\"currency\":null,\"fractionDigits\":null}");
  }

  @Test
  void a_currency_without_minor_units() {
    assertThat(OrganizationContext.of(CALENDAR, Currency.getInstance("JPY")).fractionDigits())
        .isZero();
  }

  @Test
  void the_endpoint_answers_the_sources_context() throws Exception {
    MockMvc mvc =
        MockMvcBuilders.standaloneSetup(
                new OrganizationController(() -> OrganizationContext.of(CALENDAR, null)))
            .build();
    mvc.perform(get(OrganizationController.PATH))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.timeZone").value("America/New_York"))
        .andExpect(jsonPath("$.today").value("2026-11-20"));
  }
}
