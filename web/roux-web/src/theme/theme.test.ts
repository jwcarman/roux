// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { brandPalette, contrastRatio, SHADES } from "./brandPalette";
import { defaultConfig } from "@chakra-ui/react";
import { formatHex } from "culori";
import { createThemeSystem, DEFAULT_THEME, PALETTES, type ShellTheme } from "./theme";

/** A token's value in the system built for `theme`. */
const tokenOf = (theme: ShellTheme, name: string): unknown => createThemeSystem(theme).tokens.getByName(name)?.value;

describe("createThemeSystem", () => {
  it("gives today's look for the defaults", () => {
    const system = createThemeSystem(DEFAULT_THEME);

    expect(system._config.globalCss?.html).toMatchObject({ colorPalette: "gray" });
    expect(tokenOf(DEFAULT_THEME, "radii.l2")).toBe("0.25rem");
    expect(system.token("fonts.body")).toMatch(/^Inter, -apple-system/);
  });

  it.each([
    ["square", "0", "0", "0"],
    ["slight", "0.0625rem", "0.125rem", "0.25rem"],
    ["medium", "0.125rem", "0.25rem", "0.375rem"],
    ["round", "0.375rem", "0.5rem", "0.75rem"],
    ["extra-round", "0.5rem", "0.75rem", "1rem"],
  ] as const)("rounds %s corners", (shape, l1, l2, l3) => {
    const theme = { ...DEFAULT_THEME, shape };

    expect([tokenOf(theme, "radii.l1"), tokenOf(theme, "radii.l2"), tokenOf(theme, "radii.l3")]).toEqual([l1, l2, l3]);
  });

  it.each([
    ["modern", "Inter Variable"],
    ["friendly", "Nunito Variable"],
    ["classic", "Lora Variable"],
  ] as const)("letters headings and text in %s", (font, family) => {
    const system = createThemeSystem({ ...DEFAULT_THEME, headingFont: font, bodyFont: "standard" });

    expect(system.token("fonts.heading")).toContain(family);
    expect(system.token("fonts.body")).not.toContain(family);
    expect(createThemeSystem({ ...DEFAULT_THEME, bodyFont: font }).token("fonts.body")).toContain(family);
  });

  it("uses a built-in palette by name", () => {
    expect(createThemeSystem({ ...DEFAULT_THEME, palette: "teal" })._config.globalCss?.html).toMatchObject({
      colorPalette: "teal",
    });
  });

  it("builds the brand palette from the owner's color", () => {
    const system = createThemeSystem({ ...DEFAULT_THEME, palette: "brand", brandColor: "#c2410c" });
    const expected = brandPalette("#c2410c");

    expect(system._config.globalCss?.html).toMatchObject({ colorPalette: "brand" });
    expect(system.token("colors.brand.500")).toBe(expected.shades["500"]);
    expect(JSON.stringify(system.tokens.getByName("colors.brand.solid"))).toContain(expected.tokens.solid.light);
  });
});

/** A Chakra color value as hex: a reference such as `{colors.teal.600}`, or a color name. */
function resolveColor(value: string): string {
  const reference = /^\{colors\.([a-z]+)(?:\.(\d+))?\}$/.exec(value);
  if (reference !== null) {
    const tokens = defaultConfig.theme?.tokens?.colors as Record<string, unknown>;
    const entry = tokens[reference[1]] as Record<string, { value: unknown }> & { value?: unknown };
    return resolveColor(String(reference[2] === undefined ? entry.value : entry[reference[2]].value));
  }
  return formatHex(value) as string;
}

/** Chakra's solid button color for a built-in palette, and the text that reads best on it. */
function buttonColors(palette: string) {
  const semantic = defaultConfig.theme?.semanticTokens?.colors as Record<string, Record<string, { value: unknown }>>;
  const solid = semantic[palette].solid.value as { _light: string; _dark: string };
  const light = resolveColor(solid._light);
  const dark = resolveColor(solid._dark);
  const textOn = (color: string) =>
    contrastRatio("#ffffff", color) >= contrastRatio("#000000", color) ? "#ffffff" : "#000000";
  return { solid: { light, dark }, contrast: { light: textOn(light), dark: textOn(dark) } };
}

describe("the text on a built-in palette's buttons", () => {
  it.each(PALETTES.filter((palette) => palette !== "brand"))("is the one that reads best on %s", (palette) => {
    const { solid, contrast } = buttonColors(palette);
    const token = createThemeSystem({ ...DEFAULT_THEME, palette }).tokens.getByName(`colors.${palette}.contrast`);

    expect(token?.extensions.conditions).toEqual({ _light: contrast.light, _dark: contrast.dark });
    expect(contrastRatio(contrast.light, solid.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(contrast.dark, solid.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("is black on the light palettes Chakra puts white on", () => {
    const text = (palette: string) =>
      createThemeSystem(DEFAULT_THEME).tokens.getByName(`colors.${palette}.contrast`)?.extensions.conditions;

    expect(text("teal")).toEqual({ _light: "#000000", _dark: "#000000" });
    expect(text("gray")).toEqual({ _light: "#ffffff", _dark: "#000000" });
  });
});

describe("the brand palette in the system", () => {
  const brand = brandPalette("#c2410c");
  const system = createThemeSystem({ ...DEFAULT_THEME, palette: "brand", brandColor: "#c2410c" });
  const semantic = (name: string) => system.tokens.getByName(`colors.brand.${name}`)?.extensions.conditions;

  it("has every shade", () => {
    for (const shade of SHADES) {
      expect(system.token(`colors.brand.${shade}`)).toBe(brand.shades[shade]);
    }
  });

  it("has each role in light and dark", () => {
    for (const role of ["solid", "contrast", "fg", "muted", "subtle", "emphasized", "focusRing"] as const) {
      expect(semantic(role), role).toEqual({ _light: brand.tokens[role].light, _dark: brand.tokens[role].dark });
    }
  });

  it("outlines with the 500 shade in light mode and the 400 in dark", () => {
    expect(semantic("border")).toEqual({ _light: brand.shades["500"], _dark: brand.shades["400"] });
  });
});
