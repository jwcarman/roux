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
package org.jwcarman.roux.spa;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ShellThemeTest {

  @Test
  void the_stock_look_is_chakras_under_the_given_name() {
    assertThat(ShellTheme.stock("Dojo"))
        .isEqualTo(new ShellTheme("Dojo", "gray", "#3b82f6", "medium", "standard", "standard"));
  }

  @Test
  void every_part_is_required() {
    assertThatThrownBy(() -> new ShellTheme(null, "gray", "#abcdef", "round", "modern", "modern"))
        .hasMessage("appName");
    assertThatThrownBy(() -> new ShellTheme("n", null, "#abcdef", "round", "modern", "modern"))
        .hasMessage("palette");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", null, "round", "modern", "modern"))
        .hasMessage("brandColor");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", null, "modern", "modern"))
        .hasMessage("shape");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", "round", null, "modern"))
        .hasMessage("headingFont");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", "round", "modern", null))
        .hasMessage("bodyFont");
  }

  @Test
  void the_name_is_one_to_sixty_characters() {
    assertThat(ShellTheme.stock("x").appName()).isEqualTo("x");
    assertThat(ShellTheme.stock("x".repeat(60)).appName()).hasSize(60);
    assertThatThrownBy(() -> ShellTheme.stock("x".repeat(61)))
        .hasMessage("appName '" + "x".repeat(61) + "' must be 1 to 60 characters");
    assertThatThrownBy(() -> ShellTheme.stock("  "))
        .hasMessage("appName '  ' must be 1 to 60 characters");
    assertThatThrownBy(() -> ShellTheme.stock("")).isInstanceOf(IllegalArgumentException.class);
  }

  @Test
  void every_known_value_is_accepted() {
    for (String palette : ShellTheme.PALETTES.split("\\|")) {
      assertThat(new ShellTheme("n", palette, "#AbCdEf", "round", "classic", "friendly").palette())
          .isEqualTo(palette);
    }
    for (String shape : ShellTheme.SHAPES.split("\\|")) {
      assertThat(new ShellTheme("n", "gray", "#abcdef", shape, "modern", "standard").shape())
          .isEqualTo(shape);
    }
  }

  @Test
  void a_value_the_frontend_has_no_look_for_is_refused_naming_it() {
    assertThatThrownBy(() -> new ShellTheme("n", "mauve", "#abcdef", "round", "modern", "modern"))
        .hasMessageStartingWith("palette 'mauve' must be gray|");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "red", "round", "modern", "modern"))
        .hasMessageStartingWith("brandColor 'red'");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#12345", "round", "modern", "modern"))
        .hasMessageStartingWith("brandColor '#12345'");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", "oval", "modern", "modern"))
        .hasMessageStartingWith("shape 'oval'");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", "round", "comic", "modern"))
        .hasMessageStartingWith("headingFont 'comic'");
    assertThatThrownBy(() -> new ShellTheme("n", "gray", "#abcdef", "round", "modern", "comic"))
        .hasMessageStartingWith("bodyFont 'comic'");
    assertThatThrownBy(() -> new ShellTheme("n", "xgray", "#abcdef", "round", "modern", "modern"))
        .isInstanceOf(IllegalArgumentException.class);
    assertThatThrownBy(() -> new ShellTheme("n", "grayx", "#abcdef", "round", "modern", "modern"))
        .isInstanceOf(IllegalArgumentException.class);
  }
}
