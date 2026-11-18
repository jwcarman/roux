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
package org.jwcarman.roux.theme;

import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.spa.ShellTheme;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ThemeControllerTest {

  private static final String BODY =
      "{\"appName\":\"Dojo\",\"palette\":\"teal\",\"brandColor\":\"#ff8800\",\"shape\":\"round\","
          + "\"headingFont\":\"friendly\",\"bodyFont\":\"modern\",\"version\":0}";

  private final ThemeService themes = mock(ThemeService.class);
  private final MockMvc mvc = MockMvcBuilders.standaloneSetup(new ThemeController(themes)).build();

  @Test
  void the_path_and_the_permission_are_roux_themes() {
    org.assertj.core.api.Assertions.assertThat(ThemeController.PATH).isEqualTo("/api/theme");
    org.assertj.core.api.Assertions.assertThat(ThemeController.MANAGE).isEqualTo("theme.manage");
  }

  @Test
  void get_answers_the_theme() throws Exception {
    when(themes.current()).thenReturn(ThemeResponse.of(ShellTheme.stock("Dojo"), 0));

    mvc.perform(get("/api/theme"))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.appName").value("Dojo"))
        .andExpect(jsonPath("$.palette").value("gray"))
        .andExpect(jsonPath("$.version").value(0));
  }

  @Test
  void put_saves_what_it_is_given_and_answers_the_saved_theme() throws Exception {
    ThemeRequest request =
        new ThemeRequest("Dojo", "teal", "#ff8800", "round", "friendly", "modern", 0L);
    when(themes.update(request))
        .thenReturn(new ThemeResponse("Dojo", "teal", "#ff8800", "round", "friendly", "modern", 1));

    mvc.perform(put("/api/theme").contentType(MediaType.APPLICATION_JSON).content(BODY))
        .andExpect(status().isOk())
        .andExpect(jsonPath("$.palette").value("teal"))
        .andExpect(jsonPath("$.version").value(1));
  }

  @Test
  void put_refuses_an_invalid_theme() throws Exception {
    mvc.perform(
            put("/api/theme")
                .contentType(MediaType.APPLICATION_JSON)
                .content(BODY.replace("teal", "mauve")))
        .andExpect(status().isBadRequest());
  }
}
