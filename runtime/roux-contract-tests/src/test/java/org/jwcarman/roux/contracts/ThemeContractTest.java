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
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.csrf;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.user;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

/**
 * roux-theme as an application gets it from the starter, on PostgreSQL: the table from the jar's
 * changelog (Hibernate validates its mapping against it), the API behind who's chain, and the
 * shell's source reading what was saved.
 */
@SpringBootTest(classes = ContractTestApplication.class)
@AutoConfigureMockMvc
class ThemeContractTest {

  private static final String BODY =
      "{\"appName\":\"  Dojo  \",\"palette\":\"teal\",\"brandColor\":\"#FF8800\",\"shape\":\"round\","
          + "\"headingFont\":\"friendly\",\"bodyFont\":\"modern\",\"version\":%d}";

  @Autowired MockMvc mvc;
  @Autowired ShellThemeSource shell;
  @Autowired JdbcTemplate jdbc;

  @BeforeEach
  void freshTheme() {
    jdbc.update(
        "update roux_theme set version = 0, app_name = null, palette = null, brand_color = null,"
            + " shape = null, heading_font = null, body_font = null");
  }

  private static MockHttpServletRequestBuilder save(int version) {
    return put("/api/theme")
        .contentType(MediaType.APPLICATION_JSON)
        .content(BODY.formatted(version));
  }

  private static MockHttpServletRequestBuilder asOwner(MockHttpServletRequestBuilder request) {
    return request
        .with(user("owner").authorities(new SimpleGrantedAuthority("theme.manage")))
        .with(csrf());
  }

  @Test
  void theThemeIsTheStockLookUnderTheApplicationNameUntilTheOwnerSavesOne() throws Exception {
    mvc.perform(get("/api/theme"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.appName").value("roux-contract-tests"))
        .andExpect(jsonPath("$.palette").value("gray"))
        .andExpect(jsonPath("$.brandColor").value("#3b82f6"))
        .andExpect(jsonPath("$.version").value(0));
    assertThat(shell.current()).isEqualTo(ShellTheme.stock("roux-contract-tests"));
  }

  @Test
  void theOwnerSavesAThemeAndTheShellReadsIt() throws Exception {
    mvc.perform(asOwner(save(0)))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.appName").value("Dojo"))
        .andExpect(jsonPath("$.brandColor").value("#ff8800"))
        .andExpect(jsonPath("$.version").value(1));

    mvc.perform(get("/api/theme"))
        .andExpect(jsonPath("$.palette").value("teal"))
        .andExpect(jsonPath("$.version").value(1));
    assertThat(shell.current())
        .isEqualTo(new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern"));
  }

  @Test
  void aStaleVersionIsAConflict() throws Exception {
    mvc.perform(asOwner(save(0))).andExpect(status().isOk());

    mvc.perform(asOwner(save(0)))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.status").value(409));
    mvc.perform(
            asOwner(
                put("/api/theme")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(BODY.formatted(1).replace("teal", "blue"))))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.version").value(2));
  }

  @Test
  void aBadValueIsAFieldProblem() throws Exception {
    mvc.perform(
            asOwner(
                put("/api/theme")
                    .contentType(MediaType.APPLICATION_JSON)
                    .content(BODY.formatted(0).replace("teal", "mauve"))))
        .andExpect(status().isBadRequest())
        .andExpect(
            jsonPath("$.errors[?(@.field == 'palette')].message")
                .value("Is not in the expected format"));
  }

  @Test
  void onlyWhoHoldsThemeManageMayChangeItAndSignedOutIsRefused() throws Exception {
    mvc.perform(save(0).with(user("member")).with(csrf())).andExpect(status().isForbidden());
    mvc.perform(save(0).with(csrf())).andExpect(status().isUnauthorized());
  }
}
