// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { brandPalette, contrastRatio } from "./brandPalette";
import { buttonColors, DEFAULT_THEME, PALETTES, readPageTheme, systemFor, type ThemeSettings } from "./theme";

function pageWith(json: string | null): Document {
  const doc = document.implementation.createHTMLDocument("page");
  if (json !== null) {
    const script = doc.createElement("script");
    script.type = "application/json";
    script.id = "app-theme";
    script.textContent = json;
    doc.head.append(script);
  }
  return doc;
}

/** A token's value in the system built for `theme`. */
const tokenOf = (theme: ThemeSettings, name: string) => systemFor(theme).tokens.getByName(name)?.value;

describe("systemFor", () => {
  it("gives today's look for the defaults", () => {
    const system = systemFor(DEFAULT_THEME);

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
    const system = systemFor({ ...DEFAULT_THEME, headingFont: font, bodyFont: "standard" });

    expect(system.token("fonts.heading")).toContain(family);
    expect(system.token("fonts.body")).not.toContain(family);
    expect(systemFor({ ...DEFAULT_THEME, bodyFont: font }).token("fonts.body")).toContain(family);
  });

  it("uses a built-in palette by name", () => {
    expect(systemFor({ ...DEFAULT_THEME, palette: "teal" })._config.globalCss?.html).toMatchObject({
      colorPalette: "teal",
    });
  });

  it("builds the brand palette from the owner's color", () => {
    const system = systemFor({ ...DEFAULT_THEME, palette: "brand", brandColor: "#c2410c" });
    const expected = brandPalette("#c2410c");

    expect(system._config.globalCss?.html).toMatchObject({ colorPalette: "brand" });
    expect(system.token("colors.brand.500")).toBe(expected.shades["500"]);
    expect(JSON.stringify(system.tokens.getByName("colors.brand.solid"))).toContain(expected.tokens.solid.light);
  });
});

describe("buttonColors", () => {
  it.each(PALETTES.filter((palette) => palette !== "brand"))("makes text on %s buttons readable", (palette) => {
    const { solid, contrast } = buttonColors(palette);

    expect(contrastRatio(contrast.light, solid.light)).toBeGreaterThanOrEqual(4.5);
    expect(contrastRatio(contrast.dark, solid.dark)).toBeGreaterThanOrEqual(4.5);
  });

  it("keeps Chakra's own choice where it is readable", () => {
    expect(buttonColors("gray").contrast).toEqual({ light: "#ffffff", dark: "#000000" });
    expect(buttonColors("blue").contrast).toEqual({ light: "#ffffff", dark: "#ffffff" });
  });

  it("puts the readable text color into the system", () => {
    const token = systemFor({ ...DEFAULT_THEME, palette: "teal" }).tokens.getByName("colors.teal.contrast");

    expect(JSON.stringify(token)).toContain(buttonColors("teal").contrast.light);
  });
});

describe("readPageTheme", () => {
  it("takes the defaults when the page carries no theme", () => {
    expect(readPageTheme(pageWith(null))).toEqual(DEFAULT_THEME);
  });

  it("takes the defaults when the theme is not JSON", () => {
    expect(readPageTheme(pageWith("__APP_THEME__"))).toEqual(DEFAULT_THEME);
  });

  it("reads the page's theme", () => {
    const saved: ThemeSettings = {
      palette: "brand",
      brandColor: "#ff8800",
      shape: "round",
      headingFont: "friendly",
      bodyFont: "modern",
      appName: "Dojo",
    };

    expect(readPageTheme(pageWith(JSON.stringify(saved)))).toEqual(saved);
  });

  it("replaces each value it does not know with the default", () => {
    const theme = readPageTheme(
      pageWith('{"palette":"mauve","brandColor":"red","shape":"round","headingFont":7,"appName":"  "}'),
    );

    expect(theme).toEqual({ ...DEFAULT_THEME, shape: "round" });
  });
});
