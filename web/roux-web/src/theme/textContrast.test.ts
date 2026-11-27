// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { contrastRatio } from "./brandPalette";
import { TONES } from "../surface/components/layout";
import { createThemeSystem, DEFAULT_THEME, PALETTES, type ShellTheme } from "./theme";

type Mode = "light" | "dark";
type System = ReturnType<typeof createThemeSystem>;

/** A color token's hex in a mode, following references through the system's tokens. */
function colorOf(system: System, name: string, mode: Mode): string {
  const token = system.tokens.getByName(`colors.${name}`);
  if (token === undefined) throw new Error(`No token ${name}`);
  const conditions: unknown = token.extensions.conditions;
  const value = conditions
    ? (conditions as Record<string, string>)[mode === "light" ? "_light" : "_dark"]
    : String(token.value);
  const reference = /^\{colors\.(.+)\}$/.exec(value);
  return reference ? colorOf(system, reference[1], mode) : value;
}

const BRAND_COLORS = ["#fde047", "#3b82f6", "#111827", "#f97316"];
const THEMES: ShellTheme[] = [
  ...PALETTES.filter((palette) => palette !== "brand").map((palette) => ({ ...DEFAULT_THEME, palette })),
  ...BRAND_COLORS.map((brandColor) => ({ ...DEFAULT_THEME, palette: "brand" as const, brandColor })),
];
const CARDS = [
  ["flat", "bg.panel"],
  ["raised", "bg.raised"],
] as const;

describe("colored text on a card", () => {
  it.each(
    THEMES.flatMap((theme) =>
      CARDS.flatMap(([depth, card]) =>
        (["light", "dark"] as const).map(
          (mode) => [theme.palette, theme.brandColor, depth, card, mode, theme] as const,
        ),
      ),
    ),
  )("%s (%s) %s %s %s: the palette's and red's text reads at 4.5:1", (_palette, _brand, depth, card, mode, theme) => {
    const system = createThemeSystem({ ...theme, depth });
    const background = colorOf(system, card, mode);
    for (const text of [`${theme.palette}.fg`, "red.fg"]) {
      expect(contrastRatio(colorOf(system, text, mode), background)).toBeGreaterThanOrEqual(4.5);
    }
  });

  it.each(
    Object.entries(TONES).flatMap(([tone, palette]) =>
      (["flat", "raised"] as const).flatMap((depth) =>
        (["light", "dark"] as const).map((mode) => [tone, palette, depth, mode] as const),
      ),
    ),
  )("a %s badge (%s), %s, %s: its text reads on its subtle background at 4.5:1", (_tone, palette, depth, mode) => {
    const system = createThemeSystem({ ...DEFAULT_THEME, depth });
    expect(
      contrastRatio(colorOf(system, `${palette}.fg`, mode), colorOf(system, `${palette}.subtle`, mode)),
    ).toBeGreaterThanOrEqual(4.5);
  });
});
