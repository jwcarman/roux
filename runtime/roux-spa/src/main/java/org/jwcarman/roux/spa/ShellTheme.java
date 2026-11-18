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

import java.util.Objects;

/**
 * How the app looks and what it is called, as the shell carries it to the browser: written into the
 * page (as JSON, and the app's name as its title) so the first paint already has the right look.
 * The values are the frontend's own vocabulary ({@code @jwcarman/roux-web/theme}): a palette name,
 * a hex brand colour, a shape and two font names.
 *
 * @param appName what the app is called, shown as the page title and in the header
 * @param palette a Chakra palette name, or {@code brand} to generate one from {@code brandColor}
 * @param brandColor {@code #} and six hex digits
 * @param shape how round corners are
 * @param headingFont the lettering of headings
 * @param bodyFont the lettering of text
 */
public record ShellTheme(
    String appName,
    String palette,
    String brandColor,
    String shape,
    String headingFont,
    String bodyFont) {

  /** The stock palette. */
  public static final String STOCK_PALETTE = "gray";

  /** The stock brand colour. */
  public static final String STOCK_BRAND_COLOR = "#3b82f6";

  /** The stock shape. */
  public static final String STOCK_SHAPE = "medium";

  /** The stock font, for headings and for text. */
  public static final String STOCK_FONT = "standard";

  /** Chakra's built-in palettes, and {@code brand}, generated from {@code brandColor}. */
  public static final String PALETTES =
      "gray|red|orange|yellow|green|teal|blue|cyan|purple|pink|brand";

  /** How round corners are. */
  public static final String SHAPES = "square|slight|medium|round|extra-round";

  /** The lettering, for headings and for text. */
  public static final String FONTS = "standard|modern|friendly|classic";

  /** A colour as {@code #} and six hex digits. */
  public static final String COLOR = "#[0-9a-fA-F]{6}";

  /** The longest app name, in characters. */
  public static final int MAX_APP_NAME = 60;

  /**
   * Every part is required, and a value the frontend has no look for is refused, so a theme that
   * would render wrongly fails where it is made instead of in the browser.
   *
   * @throws NullPointerException for a missing part, naming it
   * @throws IllegalArgumentException for a value outside the sets above, or a blank or too long
   *     name, naming it
   */
  public ShellTheme {
    Objects.requireNonNull(appName, "appName");
    Objects.requireNonNull(palette, "palette");
    Objects.requireNonNull(brandColor, "brandColor");
    Objects.requireNonNull(shape, "shape");
    Objects.requireNonNull(headingFont, "headingFont");
    Objects.requireNonNull(bodyFont, "bodyFont");
    if (appName.isBlank() || appName.length() > MAX_APP_NAME) {
      throw invalid("appName", appName, "1 to " + MAX_APP_NAME + " characters");
    }
    require("palette", palette, PALETTES);
    require("brandColor", brandColor, COLOR);
    require("shape", shape, SHAPES);
    require("headingFont", headingFont, FONTS);
    require("bodyFont", bodyFont, FONTS);
  }

  private static void require(String part, String value, String allowed) {
    if (!value.matches(allowed)) {
      throw invalid(part, value, allowed);
    }
  }

  private static IllegalArgumentException invalid(String part, String value, String allowed) {
    return new IllegalArgumentException(part + " '" + value + "' must be " + allowed);
  }

  /** The stock look under this name. */
  public static ShellTheme stock(String appName) {
    return new ShellTheme(
        appName, STOCK_PALETTE, STOCK_BRAND_COLOR, STOCK_SHAPE, STOCK_FONT, STOCK_FONT);
  }
}
