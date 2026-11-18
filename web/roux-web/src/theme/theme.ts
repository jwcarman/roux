import { createSystem, defaultConfig, defineConfig, type SystemContext } from "@chakra-ui/react";
import { brandPalette, SHADES } from "./brandPalette";
import { FONT_FAMILY, FONTS, type Font } from "./fonts";

/**
 * The palettes the owner can choose: Chakra's built-in ones, and `brand`, generated from the
 * owner's own color (`brandPalette`). roux-theme accepts the same list (`ShellTheme.PALETTES`).
 */
export const PALETTES = [
  "gray",
  "red",
  "orange",
  "yellow",
  "green",
  "teal",
  "blue",
  "cyan",
  "purple",
  "pink",
  "brand",
] as const;
export type Palette = (typeof PALETTES)[number];

/** How round corners are, squarest first. */
export const SHAPES = ["square", "slight", "medium", "round", "extra-round"] as const;
export type Shape = (typeof SHAPES)[number];

export { FONTS, type Font };

/** How the app looks and what it is called: what the server writes into the page. */
export interface ShellTheme {
  /** What the app is called: the page title, and whatever the app shows as its name. */
  appName: string;
  palette: Palette;
  /** The owner's own color, `#rrggbb`; used when `palette` is `brand`, kept when it is not. */
  brandColor: string;
  shape: Shape;
  headingFont: Font;
  bodyFont: Font;
}

/** The look a page has when no server wrote one into it (Vite's dev server): Chakra's stock look. */
export const DEFAULT_THEME: ShellTheme = {
  appName: "App",
  palette: "gray",
  brandColor: "#3b82f6",
  shape: "medium",
  headingFont: "standard",
  bodyFont: "standard",
};

/** Chakra's corner radii (`l1` small controls, `l2` buttons and inputs, `l3` cards) per shape. */
export const RADII: Record<Shape, [string, string, string]> = {
  square: ["0", "0", "0"],
  slight: ["0.0625rem", "0.125rem", "0.25rem"],
  medium: ["0.125rem", "0.25rem", "0.375rem"],
  round: ["0.375rem", "0.5rem", "0.75rem"],
  "extra-round": ["0.5rem", "0.75rem", "1rem"],
};

/**
 * The text on a built-in palette's solid buttons, per color mode: black or white, whichever reads
 * better (checked against Chakra's own button colors in the tests). Chakra's own choice is white on
 * some palettes too light for it (teal, green, cyan, orange), which fails WCAG AA.
 */
const BUTTON_TEXT: Record<Exclude<Palette, "brand">, { light: string; dark: string }> = {
  gray: { light: "#ffffff", dark: "#000000" },
  red: { light: "#ffffff", dark: "#ffffff" },
  orange: { light: "#000000", dark: "#000000" },
  yellow: { light: "#000000", dark: "#000000" },
  green: { light: "#000000", dark: "#000000" },
  teal: { light: "#000000", dark: "#000000" },
  blue: { light: "#ffffff", dark: "#ffffff" },
  cyan: { light: "#000000", dark: "#000000" },
  purple: { light: "#ffffff", dark: "#ffffff" },
  pink: { light: "#ffffff", dark: "#ffffff" },
};

const BUILT_IN_CONTRAST = Object.fromEntries(
  Object.entries(BUTTON_TEXT).map(([palette, text]) => [
    palette,
    { contrast: { value: { _light: text.light, _dark: text.dark } } },
  ]),
);

/**
 * The Chakra system for a theme: its palette for every colored component, corners and lettering.
 * `ThemeProvider` builds one from the page's theme; call this for an app that mounts Chakra itself.
 */
export function createThemeSystem(theme: ShellTheme): SystemContext {
  const brand = brandPalette(theme.brandColor);
  const [l1, l2, l3] = RADII[theme.shape];
  const byMode = (value: { light: string; dark: string }) => ({ value: { _light: value.light, _dark: value.dark } });
  const shades = Object.fromEntries(SHADES.map((shade) => [shade, { value: brand.shades[shade] }]));
  return createSystem(
    defaultConfig,
    defineConfig({
      globalCss: {
        html: { colorPalette: theme.palette },
      },
      theme: {
        tokens: {
          colors: { brand: shades },
          fonts: {
            heading: { value: FONT_FAMILY[theme.headingFont] },
            body: { value: FONT_FAMILY[theme.bodyFont] },
          },
        },
        semanticTokens: {
          colors: {
            ...BUILT_IN_CONTRAST,
            brand: {
              solid: byMode(brand.tokens.solid),
              contrast: byMode(brand.tokens.contrast),
              fg: byMode(brand.tokens.fg),
              muted: byMode(brand.tokens.muted),
              subtle: byMode(brand.tokens.subtle),
              emphasized: byMode(brand.tokens.emphasized),
              focusRing: byMode(brand.tokens.focusRing),
              border: byMode({ light: brand.shades["500"], dark: brand.shades["400"] }),
            },
          },
          radii: { l1: { value: l1 }, l2: { value: l2 }, l3: { value: l3 } },
        },
      },
    }),
  );
}
