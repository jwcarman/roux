import { formatHex, oklch, toGamut, wcagContrast, type Oklch } from "culori";

/** Chakra's shade names, lightest first. */
export const SHADES = ["50", "100", "200", "300", "400", "500", "600", "700", "800", "900", "950"] as const;
export type Shade = (typeof SHADES)[number];

/** The palette roles Chakra's components use. */
export type PaletteToken = "solid" | "contrast" | "fg" | "muted" | "subtle" | "emphasized" | "focusRing";

export interface BrandPalette {
  shades: Record<Shade, string>;
  tokens: Record<PaletteToken, { light: string; dark: string }>;
  /** True for a mode whose buttons use a shade near the owner's color, not the color itself. */
  adjusted: { light: boolean; dark: boolean };
}

/** Each shade's OKLCH lightness, and how much of the owner's colorfulness it keeps. */
const LIGHTNESS: Record<Shade, number> = {
  "50": 0.97,
  "100": 0.93,
  "200": 0.87,
  "300": 0.79,
  "400": 0.7,
  "500": 0.62,
  "600": 0.54,
  "700": 0.46,
  "800": 0.38,
  "900": 0.3,
  "950": 0.22,
};
const CHROMA: Record<Shade, number> = {
  "50": 0.15,
  "100": 0.3,
  "200": 0.55,
  "300": 0.8,
  "400": 0.95,
  "500": 1,
  "600": 1,
  "700": 0.95,
  "800": 0.85,
  "900": 0.7,
  "950": 0.55,
};

/** Chakra's page background in each mode (`bg`: white, and `gray.950`). */
const BACKGROUND = { light: "#ffffff", dark: "#09090b" } as const;

/** WCAG's minimum contrast for a control against what is around it. */
const NON_TEXT_CONTRAST = 3;

const intoSrgb = toGamut("rgb", "oklch");

/** The WCAG contrast ratio of two colors, from 1 (the same) to 21 (black on white). */
export function contrastRatio(a: string, b: string): number {
  return wcagContrast(a, b);
}

/**
 * The `brand` palette, built from one color with no guesswork: the same color always gives the same
 * palette. Every shade keeps the color's hue at a fixed lightness, the color itself replaces the
 * shade nearest it, and in a mode where the color would not stand out from the page, buttons use
 * the nearest shade that does.
 *
 * @param hex the owner's color, `#rrggbb` in either case
 */
export function brandPalette(hex: string): BrandPalette {
  const color = hex.toLowerCase();
  const base = oklch(color);
  if (base === undefined) {
    throw new Error(`Not a color: ${hex}`);
  }
  const shades = shadesOf(base, color);
  const light = solidFor(color, base, shades, "light");
  const dark = solidFor(color, base, shades, "dark");
  const both = (lightShade: Shade, darkShade: Shade) => ({ light: shades[lightShade], dark: shades[darkShade] });
  return {
    shades,
    tokens: {
      solid: { light, dark },
      contrast: { light: textOn(light), dark: textOn(dark) },
      fg: both("700", "300"),
      subtle: both("100", "900"),
      muted: both("200", "800"),
      emphasized: both("300", "700"),
      focusRing: { light, dark },
    },
    adjusted: { light: light !== color, dark: dark !== color },
  };
}

function shadesOf(base: Oklch, color: string): Record<Shade, string> {
  const nearest = nearestShade(base.l);
  const shades = {} as Record<Shade, string>;
  for (const shade of SHADES) {
    shades[shade] =
      shade === nearest
        ? color
        : formatHex(intoSrgb({ mode: "oklch", l: LIGHTNESS[shade], c: base.c * CHROMA[shade], h: base.h }));
  }
  return shades;
}

function nearestShade(lightness: number): Shade {
  return SHADES.reduce((best, shade) =>
    Math.abs(LIGHTNESS[shade] - lightness) < Math.abs(LIGHTNESS[best] - lightness) ? shade : best,
  );
}

/** The owner's color if it stands out from the mode's page; otherwise the nearest shade that does. */
function solidFor(color: string, base: Oklch, shades: Record<Shade, string>, mode: "light" | "dark"): string {
  const background = BACKGROUND[mode];
  if (contrastRatio(color, background) >= NON_TEXT_CONTRAST) {
    return color;
  }
  const byNearness = [...SHADES].sort(
    (a, b) => Math.abs(LIGHTNESS[a] - base.l) - Math.abs(LIGHTNESS[b] - base.l),
  );
  const usable = byNearness.find((shade) => contrastRatio(shades[shade], background) >= NON_TEXT_CONTRAST);
  return shades[usable ?? (mode === "light" ? "950" : "50")];
}

/** Black or white, whichever reads better on `color`. */
function textOn(color: string): string {
  return contrastRatio("#000000", color) >= contrastRatio("#ffffff", color) ? "#000000" : "#ffffff";
}
