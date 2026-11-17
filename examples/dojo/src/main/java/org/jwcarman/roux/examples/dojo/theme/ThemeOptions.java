package org.jwcarman.roux.examples.dojo.theme;

/**
 * The values a theme may hold, as the patterns its request is validated against, and the defaults:
 * the template's own look. The client keeps the same lists ({@code frontend/src/theme.ts}).
 */
public final class ThemeOptions {

  /** Chakra's built-in palettes, and {@code brand}, generated from {@code brandColor}. */
  public static final String PALETTE =
      "gray|red|orange|yellow|green|teal|blue|cyan|purple|pink|brand";

  /** How round corners are. */
  public static final String SHAPE = "square|slight|medium|round|extra-round";

  /** The lettering, for headings and for text. */
  public static final String FONT = "standard|modern|friendly|classic";

  /** A color as {@code #} and six hex digits. */
  public static final String COLOR = "#[0-9a-fA-F]{6}";

  /** The longest app name, in characters. */
  public static final int MAX_APP_NAME = 60;

  public static final String DEFAULT_PALETTE = "gray";
  public static final String DEFAULT_BRAND_COLOR = "#3b82f6";
  public static final String DEFAULT_SHAPE = "medium";
  public static final String DEFAULT_FONT = "standard";

  private ThemeOptions() {}
}
