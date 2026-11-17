import { createSystem, defaultConfig, defineConfig, type SystemContext } from "@chakra-ui/react";
import { formatHex } from "culori";
import { brandPalette, contrastRatio, SHADES } from "./brandPalette";
import { FONT_FAMILY, FONTS, type Font } from "./fonts";

export { FONTS, type Font } from "./fonts";

/**
 * The palettes the owner can choose: Chakra's built-in ones, and `brand`, generated from the
 * owner's own color (`brandPalette`). The server accepts the same lists (`ThemeOptions`).
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

/** How the app looks, as the owner chose it on the Appearance page. */
export interface ThemeSettings {
  palette: Palette;
  /** The owner's own color, `#rrggbb`; used when `palette` is `brand`, kept when it is not. */
  brandColor: string;
  shape: Shape;
  headingFont: Font;
  bodyFont: Font;
  appName: string;
}

/** The template's own look, which an app has until its owner saves another. */
export const DEFAULT_THEME: ThemeSettings = {
  palette: "gray",
  brandColor: "#3b82f6",
  shape: "medium",
  headingFont: "standard",
  bodyFont: "standard",
  appName: "Dojo",
};

/** The palette of a destructive action's button (deactivate, delete), whatever the theme. */
export const DANGER_PALETTE = "red";

/** Chakra's corner radii (`l1` small controls, `l2` buttons and inputs, `l3` cards) per shape. */
export const RADII: Record<Shape, [string, string, string]> = {
  square: ["0", "0", "0"],
  slight: ["0.0625rem", "0.125rem", "0.25rem"],
  medium: ["0.125rem", "0.25rem", "0.375rem"],
  round: ["0.375rem", "0.5rem", "0.75rem"],
  "extra-round": ["0.5rem", "0.75rem", "1rem"],
};

type ModeValues = { light: string; dark: string };
type TokenTree = Record<string, Record<string, { value: unknown }> | undefined>;

/** A Chakra color value as hex: a reference such as `{colors.teal.600}`, or a color name. */
function resolveColor(value: string): string {
  const reference = /^\{colors\.([a-z]+)(?:\.(\d+))?\}$/.exec(value);
  if (reference !== null) {
    const tokens = defaultConfig.theme?.tokens?.colors as Record<string, unknown>;
    const entry = tokens[reference[1]] as Record<string, { value: unknown }> & { value?: unknown };
    return resolveColor(String(reference[2] === undefined ? entry.value : entry[reference[2]]?.value));
  }
  return formatHex(value) ?? value;
}

/**
 * A built-in palette's button color, as Chakra defines it, and the text to put on it: black or
 * white, whichever reads better. Chakra's own choice is white on some palettes too light for it
 * (teal, green, cyan, orange), which fails WCAG AA.
 */
export function buttonColors(palette: Exclude<Palette, "brand">): { solid: ModeValues; contrast: ModeValues } {
  const semantic = defaultConfig.theme?.semanticTokens?.colors as TokenTree;
  const solid = semantic[palette]?.solid?.value as { _light: string; _dark: string };
  const light = resolveColor(solid._light);
  const dark = resolveColor(solid._dark);
  const textOn = (color: string) =>
    contrastRatio("#ffffff", color) >= contrastRatio("#000000", color) ? "#ffffff" : "#000000";
  return { solid: { light, dark }, contrast: { light: textOn(light), dark: textOn(dark) } };
}

const BUILT_IN_CONTRAST = Object.fromEntries(
  PALETTES.filter((palette) => palette !== "brand").map((palette) => {
    const { contrast } = buttonColors(palette);
    return [palette, { contrast: { value: { _light: contrast.light, _dark: contrast.dark } } }];
  }),
);

/** The Chakra system for a theme: its palette for every colored component, corners and lettering. */
export function systemFor(theme: ThemeSettings): SystemContext {
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

/**
 * The theme the server wrote into the page (`#app-theme`, by `ShellController`). Each value the
 * page lacks or this app does not know takes the default, so an old or missing theme never stops
 * the app from starting (Vite's dev server writes none).
 */
export function readPageTheme(doc: Document = document): ThemeSettings {
  let raw: Record<string, unknown> = {};
  try {
    const parsed: unknown = JSON.parse(doc.getElementById("app-theme")?.textContent ?? "");
    if (typeof parsed === "object" && parsed !== null) {
      raw = parsed as Record<string, unknown>;
    }
  } catch {
    // No theme, or not JSON: the defaults.
  }
  const oneOf = <T extends string>(value: unknown, allowed: readonly T[], fallback: T): T =>
    allowed.includes(value as T) ? (value as T) : fallback;
  const appName = typeof raw.appName === "string" && raw.appName.trim() !== "" ? raw.appName : DEFAULT_THEME.appName;
  const brandColor =
    typeof raw.brandColor === "string" && /^#[0-9a-fA-F]{6}$/.test(raw.brandColor)
      ? raw.brandColor
      : DEFAULT_THEME.brandColor;
  return {
    palette: oneOf(raw.palette, PALETTES, DEFAULT_THEME.palette),
    brandColor,
    shape: oneOf(raw.shape, SHAPES, DEFAULT_THEME.shape),
    headingFont: oneOf(raw.headingFont, FONTS, DEFAULT_THEME.headingFont),
    bodyFont: oneOf(raw.bodyFont, FONTS, DEFAULT_THEME.bodyFont),
    appName,
  };
}
