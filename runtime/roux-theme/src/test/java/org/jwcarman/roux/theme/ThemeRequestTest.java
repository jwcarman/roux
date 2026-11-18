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

import java.util.Set;
import java.util.stream.Collectors;

import jakarta.validation.ConstraintViolation;
import jakarta.validation.Validation;
import jakarta.validation.Validator;

import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.jwcarman.roux.spa.ShellTheme;

@DisplayNameGeneration(ReplaceUnderscores.class)
class ThemeRequestTest {

  private static final Validator VALIDATOR =
      Validation.buildDefaultValidatorFactory().getValidator();

  private static ThemeRequest valid() {
    return new ThemeRequest("  Dojo  ", "teal", "#FF8800", "round", "friendly", "modern", 0L);
  }

  private static Set<String> invalidFields(ThemeRequest request) {
    return VALIDATOR.validate(request).stream()
        .map(ConstraintViolation::getPropertyPath)
        .map(Object::toString)
        .collect(Collectors.toSet());
  }

  @Test
  void a_good_request_is_valid_and_becomes_a_theme_with_a_lower_case_colour_and_a_stripped_name() {
    assertThat(invalidFields(valid())).isEmpty();
    assertThat(valid().theme())
        .isEqualTo(new ShellTheme("Dojo", "teal", "#ff8800", "round", "friendly", "modern"));
  }

  @ParameterizedTest
  @CsvSource(
      delimiter = '|',
      value = {
        "appName|'   '",
        "appName|aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
        "palette|mauve",
        "brandColor|red",
        "brandColor|#12345",
        "shape|oval",
        "headingFont|comic",
        "bodyFont|''",
      })
  void each_bad_field_is_refused(String field, String value) {
    ThemeRequest ok = valid();
    ThemeRequest bad =
        new ThemeRequest(
            field.equals("appName") ? value : ok.appName(),
            field.equals("palette") ? value : ok.palette(),
            field.equals("brandColor") ? value : ok.brandColor(),
            field.equals("shape") ? value : ok.shape(),
            field.equals("headingFont") ? value : ok.headingFont(),
            field.equals("bodyFont") ? value : ok.bodyFont(),
            0L);

    assertThat(invalidFields(bad)).containsExactly(field);
  }

  @Test
  void a_missing_part_is_refused() {
    assertThat(invalidFields(new ThemeRequest(null, null, null, null, null, null, null)))
        .containsExactlyInAnyOrder(
            "appName", "palette", "brandColor", "shape", "headingFont", "bodyFont", "version");
  }

  @Test
  void every_value_the_shell_knows_is_allowed() {
    for (String palette : ShellTheme.PALETTES.split("\\|")) {
      assertThat(invalidFields(withPalette(palette))).isEmpty();
    }
  }

  private static ThemeRequest withPalette(String palette) {
    return new ThemeRequest("Dojo", palette, "#ff8800", "round", "friendly", "modern", 0L);
  }

  @Test
  void a_name_of_sixty_characters_fits() {
    assertThat(
            invalidFields(
                new ThemeRequest(
                    "a".repeat(60), "gray", "#ff8800", "round", "classic", "modern", 0L)))
        .isEmpty();
  }
}
