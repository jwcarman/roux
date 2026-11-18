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

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.spa.ShellTheme;

@DisplayNameGeneration(ReplaceUnderscores.class)
class AppThemeTest {

  private static final ShellTheme DEFAULTS =
      new ShellTheme("Default", "gray", "#111111", "medium", "standard", "classic");

  @Test
  void the_one_themes_id_is_fixed() {
    assertThat(AppTheme.ID).hasToString("00000000-0000-0000-0000-000000000001");
    assertThat(new AppTheme(AppTheme.ID).getId()).isEqualTo(AppTheme.ID);
  }

  @Test
  void jpa_makes_a_theme_with_nothing_chosen_through_the_default_constructor() {
    assertThat(new AppTheme() {}.resolve(DEFAULTS)).isEqualTo(DEFAULTS);
  }

  @Test
  void a_theme_nothing_was_chosen_for_is_the_defaults() {
    assertThat(new AppTheme(AppTheme.ID).resolve(DEFAULTS)).isEqualTo(DEFAULTS);
  }

  @Test
  void what_was_chosen_beats_the_defaults() {
    AppTheme theme = new AppTheme(AppTheme.ID);
    ShellTheme chosen = new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern");

    theme.choose(chosen);

    assertThat(theme.resolve(DEFAULTS)).isEqualTo(chosen);
  }

  @Test
  void each_part_falls_back_on_its_own() {
    assertThat(partly("Dojo", null, null, null, null, null).resolve(DEFAULTS))
        .isEqualTo(new ShellTheme("Dojo", "gray", "#111111", "medium", "standard", "classic"));
    assertThat(partly(null, "teal", null, null, null, null).resolve(DEFAULTS).palette())
        .isEqualTo("teal");
    assertThat(partly(null, null, "#ff8800", null, null, null).resolve(DEFAULTS).brandColor())
        .isEqualTo("#ff8800");
    assertThat(partly(null, null, null, "round", null, null).resolve(DEFAULTS).shape())
        .isEqualTo("round");
    assertThat(partly(null, null, null, null, "modern", null).resolve(DEFAULTS).headingFont())
        .isEqualTo("modern");
    assertThat(partly(null, null, null, null, null, "friendly").resolve(DEFAULTS).bodyFont())
        .isEqualTo("friendly");
  }

  /** A theme with only some parts chosen, as a table row can be. */
  private static AppTheme partly(
      String name, String palette, String color, String shape, String heading, String body) {
    AppTheme theme = new AppTheme(AppTheme.ID);
    set(theme, "appName", name);
    set(theme, "palette", palette);
    set(theme, "brandColor", color);
    set(theme, "shape", shape);
    set(theme, "headingFont", heading);
    set(theme, "bodyFont", body);
    return theme;
  }

  private static void set(AppTheme theme, String field, String value) {
    org.springframework.test.util.ReflectionTestUtils.setField(theme, field, value);
  }
}
