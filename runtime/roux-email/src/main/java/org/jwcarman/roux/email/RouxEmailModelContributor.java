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

import static java.util.Map.entry;

import java.util.Collections;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Objects;

import org.jwcarman.roux.spa.ShellTheme;
import org.jwcarman.roux.spa.ShellThemeSource;
import org.jwcarman.who.core.email.WhoEmail;
import org.jwcarman.who.email.WhoEmailModelContributor;

/**
 * Gives every email {@code extra.roux}: {@code appName}, {@code brandColor} ({@code #rrggbb}) and
 * {@code buttonText} ({@code #ffffff} or a near-black, whichever reads better on the brand colour).
 * The shell's theme is read at each send, so the owner's change on the Appearance page shows in the
 * next email. The templates in this jar read these keys; an app's own templates may too.
 */
public final class RouxEmailModelContributor implements WhoEmailModelContributor {

  /** The key under {@code extra} that holds the values. */
  public static final String KEY = "roux";

  static final String WHITE = "#ffffff";
  static final String NEAR_BLACK = "#18181b";

  /**
   * Chakra's solid-button colour for each palette (the 600 shade, except {@code gray}, whose solid
   * is near-black), in light mode.
   */
  static final Map<String, String> PALETTE_COLORS =
      Map.ofEntries(
          entry("gray", NEAR_BLACK),
          entry("red", "#dc2626"),
          entry("orange", "#ea580c"),
          entry("yellow", "#ca8a04"),
          entry("green", "#16a34a"),
          entry("teal", "#0d9488"),
          entry("blue", "#2563eb"),
          entry("cyan", "#0891b2"),
          entry("purple", "#9333ea"),
          entry("pink", "#db2777"));

  private static final String BRAND = "brand";

  private final ShellThemeSource themes;

  /**
   * Creates the contributor.
   *
   * @param themes where the app's look is read, at each send
   */
  public RouxEmailModelContributor(ShellThemeSource themes) {
    this.themes = Objects.requireNonNull(themes, "themes must not be null");
  }

  @Override
  public Map<String, Object> extra(WhoEmail email) {
    ShellTheme theme = themes.current();
    String brandColor = brandColor(theme);
    return Map.of(
        KEY,
        Map.of(
            "appName", theme.appName(),
            "brandColor", brandColor,
            "buttonText", buttonText(brandColor)));
  }

  static String brandColor(ShellTheme theme) {
    String color =
        BRAND.equals(theme.palette()) ? theme.brandColor() : PALETTE_COLORS.get(theme.palette());
    return color.toLowerCase(Locale.ROOT);
  }

  /** Whichever of white and near-black has the higher WCAG contrast against the colour. */
  static String buttonText(String color) {
    double luminance = luminance(color);
    return Collections.max(
        List.of(WHITE, NEAR_BLACK),
        Comparator.comparingDouble(text -> contrast(luminance, luminance(text))));
  }

  private static double contrast(double a, double b) {
    return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
  }

  static double luminance(String color) {
    int rgb = Integer.parseInt(color.substring(1), 16);
    return 0.2126 * channel(rgb >> 16 & 0xff)
        + 0.7152 * channel(rgb >> 8 & 0xff)
        + 0.0722 * channel(rgb & 0xff);
  }

  private static double channel(int value) {
    // 10 is the last of the 0..255 values at or under the sRGB curve's 0.03928 knee
    double s = value / 255.0;
    return value <= 10 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }
}
