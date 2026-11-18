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
package org.jwcarman.roux.email;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatNullPointerException;
import static org.assertj.core.api.Assertions.within;

import java.util.Arrays;
import java.util.Map;
import java.util.concurrent.atomic.AtomicReference;

import org.assertj.core.api.InstanceOfAssertFactories;
import org.assertj.core.api.MapAssert;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator.ReplaceUnderscores;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.junit.jupiter.params.provider.ValueSource;
import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.who.core.email.WhoEmail;

@DisplayNameGeneration(ReplaceUnderscores.class)
class RouxEmailModelContributorTest {

  private static final WhoEmail EMAIL = new SignIn();

  private record SignIn() implements WhoEmail {
    @Override
    public String address() {
      return "a@example.test";
    }

    @Override
    public String template() {
      return "sign-in";
    }
  }

  private static ShellTheme theme(String name, String palette, String brandColor) {
    return new ShellTheme(name, palette, brandColor, "medium", "standard", "standard");
  }

  private static MapAssert<String, String> roux(RouxEmailModelContributor contributor) {
    Map<String, Object> extra = contributor.extra(EMAIL);
    assertThat(extra).containsOnlyKeys("roux");
    return assertThat(extra.get("roux"))
        .asInstanceOf(InstanceOfAssertFactories.map(String.class, String.class));
  }

  @Test
  void a_named_palette_gives_its_fixed_color_and_the_app_name() {
    var contributor = new RouxEmailModelContributor(() -> theme("Dojo", "teal", "#ff8800"));

    roux(contributor)
        .containsOnlyKeys("appName", "brandColor", "buttonText")
        .containsEntry("appName", "Dojo")
        .containsEntry("brandColor", "#0d9488")
        .containsEntry("buttonText", "#18181b");
  }

  @Test
  void the_brand_palette_gives_the_brand_color_in_lower_case() {
    var contributor = new RouxEmailModelContributor(() -> theme("Dojo", "brand", "#FFF59D"));

    roux(contributor).containsEntry("brandColor", "#fff59d").containsEntry("buttonText", "#18181b");
  }

  @Test
  void the_theme_is_read_at_each_send() {
    var current = new AtomicReference<>(theme("One", "blue", "#3b82f6"));
    var contributor = new RouxEmailModelContributor(current::get);
    roux(contributor).containsEntry("appName", "One").containsEntry("brandColor", "#2563eb");

    current.set(theme("Two", "brand", "#112233"));

    roux(contributor).containsEntry("appName", "Two").containsEntry("brandColor", "#112233");
  }

  @Test
  void every_palette_the_shell_knows_maps_to_a_hex() {
    String[] palettes = ShellTheme.PALETTES.split("\\|");

    for (String palette : palettes) {
      String color = RouxEmailModelContributor.brandColor(theme("A", palette, "#3b82f6"));
      assertThat(color).as(palette).matches("#[0-9a-f]{6}");
    }
    assertThat(RouxEmailModelContributor.PALETTE_COLORS.keySet())
        .containsExactlyInAnyOrderElementsOf(
            Arrays.stream(palettes).filter(p -> !p.equals("brand")).toList());
    assertThat(RouxEmailModelContributor.PALETTE_COLORS.values()).doesNotHaveDuplicates();
  }

  @ParameterizedTest
  @CsvSource({
    "#ffffff, #18181b",
    "#000000, #ffffff",
    "#ffff00, #18181b",
    "#0000ff, #ffffff",
    "#2563eb, #ffffff",
    "#ca8a04, #18181b",
    "#9e9e9e, #18181b",
    "#757575, #ffffff",
    "#0a0a0a, #ffffff",
    "#808080, #18181b"
  })
  void the_button_text_is_the_one_with_the_higher_contrast(String color, String expected) {
    assertThat(RouxEmailModelContributor.buttonText(color)).isEqualTo(expected);
  }

  @ParameterizedTest
  @ValueSource(
      strings = {
        "gray", "red", "orange", "yellow", "green", "teal", "blue", "cyan", "purple", "pink"
      })
  void the_button_text_for_every_palette_is_the_better_of_the_two(String palette) {
    String color = RouxEmailModelContributor.PALETTE_COLORS.get(palette);
    double luminance = RouxEmailModelContributor.luminance(color);
    double white = 1.05 / (luminance + 0.05);
    double dark = (luminance + 0.05) / (RouxEmailModelContributor.luminance("#18181b") + 0.05);

    assertThat(RouxEmailModelContributor.buttonText(color))
        .isEqualTo(white >= dark ? "#ffffff" : "#18181b");
  }

  @Test
  void luminance_follows_wcag_per_channel() {
    assertThat(RouxEmailModelContributor.luminance("#ff0000")).isCloseTo(0.2126, within(1e-12));
    assertThat(RouxEmailModelContributor.luminance("#00ff00")).isCloseTo(0.7152, within(1e-12));
    assertThat(RouxEmailModelContributor.luminance("#0000ff")).isCloseTo(0.0722, within(1e-12));
    assertThat(RouxEmailModelContributor.luminance("#ffffff")).isCloseTo(1.0, within(1e-12));
    // 10 is on the curve's linear stretch, 11 on its power stretch
    assertThat(RouxEmailModelContributor.luminance("#0a0a0a"))
        .isCloseTo(10 / 255.0 / 12.92, within(1e-12));
    assertThat(RouxEmailModelContributor.luminance("#0b0b0b"))
        .isCloseTo(Math.pow((11 / 255.0 + 0.055) / 1.055, 2.4), within(1e-12));
  }

  @Test
  void a_missing_source_is_refused() {
    assertThatNullPointerException()
        .isThrownBy(() -> new RouxEmailModelContributor(null))
        .withMessage("themes must not be null");
  }
}
