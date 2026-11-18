import { oklch } from "culori";
import { describe, expect, it } from "vitest";
import { brandPalette, contrastRatio, SHADES } from "./brandPalette";

const LIGHT_BG = "#ffffff";
const DARK_BG = "#09090b";

/** A small seeded generator (mulberry32), so the "any color" check is the same on every run. */
function seeded(seed: number): () => number {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function randomColor(next: () => number): string {
  const byte = () =>
    Math.floor(next() * 256)
      .toString(16)
      .padStart(2, "0");
  return `#${byte()}${byte()}${byte()}`;
}

describe("brandPalette", () => {
  it("keeps the owner's color in the scale and on the buttons", () => {
    const palette = brandPalette("#3b82f6");

    expect(Object.values(palette.shades)).toContain("#3b82f6");
    expect(palette.tokens.solid.light).toBe("#3b82f6");
    expect(palette.adjusted.light).toBe(false);
  });

  it("darkens a pale color's buttons in light mode", () => {
    const palette = brandPalette("#fff59d");

    expect(palette.adjusted.light).toBe(true);
    expect(contrastRatio(palette.tokens.solid.light, LIGHT_BG)).toBeGreaterThanOrEqual(3);
  });

  it("lightens a near-black color's buttons in dark mode", () => {
    const palette = brandPalette("#111111");

    expect(palette.adjusted.dark).toBe(true);
    expect(contrastRatio(palette.tokens.solid.dark, DARK_BG)).toBeGreaterThanOrEqual(3);
  });

  it.each(["#ffffff", "#000000"])("keeps %s usable in both modes", (color) => {
    const palette = brandPalette(color);

    expect(contrastRatio(palette.tokens.solid.light, LIGHT_BG)).toBeGreaterThanOrEqual(3);
    expect(contrastRatio(palette.tokens.solid.dark, DARK_BG)).toBeGreaterThanOrEqual(3);
  });

  it("reads an upper-case color the same as a lower-case one", () => {
    expect(brandPalette("#3B82F6")).toEqual(brandPalette("#3b82f6"));
  });

  it("refuses what is not a color, naming it", () => {
    expect(() => brandPalette("not a color")).toThrow("Not a color: not a color");
  });

  it("is the same every time", () => {
    expect(brandPalette("#c2410c")).toEqual(brandPalette("#c2410c"));
  });

  it("is readable for any color", () => {
    const next = seeded(42);
    for (let i = 0; i < 500; i++) {
      const color = randomColor(next);
      const { shades, tokens } = brandPalette(color);

      const lightness = SHADES.map((shade) => oklch(shades[shade])?.l ?? 0);
      for (let s = 1; s < lightness.length; s++) {
        expect(lightness[s], `${color}: shade ${SHADES[s]} is darker`).toBeLessThan(lightness[s - 1]);
      }
      for (const [mode, bg] of [
        ["light", LIGHT_BG],
        ["dark", DARK_BG],
      ] as const) {
        const solid = tokens.solid[mode];
        expect(contrastRatio(tokens.contrast[mode], solid), `${color} ${mode}: text on buttons`).toBeGreaterThanOrEqual(
          4.5,
        );
        expect(contrastRatio(solid, bg), `${color} ${mode}: buttons stand out`).toBeGreaterThanOrEqual(3);
        expect(contrastRatio(tokens.fg[mode], bg), `${color} ${mode}: colored text`).toBeGreaterThanOrEqual(4.5);
      }
    }
  });
});

describe("brandPalette, exactly", () => {
  it("builds the scale and roles of a blue", () => {
    expect(brandPalette("#3b82f6")).toEqual({
      shades: {
        "50": "#eaf6ff",
        "100": "#d3e9ff",
        "200": "#b4d6ff",
        "300": "#89bbff",
        "400": "#579cff",
        "500": "#3b82f6",
        "600": "#2068d9",
        "700": "#0850b9",
        "800": "#003a95",
        "900": "#00276e",
        "950": "#001549",
      },
      tokens: {
        solid: { light: "#3b82f6", dark: "#3b82f6" },
        contrast: { light: "#000000", dark: "#000000" },
        fg: { light: "#0850b9", dark: "#89bbff" },
        subtle: { light: "#d3e9ff", dark: "#00276e" },
        muted: { light: "#b4d6ff", dark: "#003a95" },
        emphasized: { light: "#89bbff", dark: "#0850b9" },
        focusRing: { light: "#3b82f6", dark: "#3b82f6" },
      },
      adjusted: { light: false, dark: false },
    });
  });

  it("builds an orange whose own color is the 600 shade", () => {
    const palette = brandPalette("#c2410c");

    expect(Object.values(palette.shades)).toEqual([
      "#fff0e9",
      "#ffddcf",
      "#ffbfa6",
      "#ff9977",
      "#f2744b",
      "#d9572a",
      "#c2410c",
      "#9f2500",
      "#7e1200",
      "#5c0600",
      "#3b0000",
    ]);
    expect(palette.tokens.contrast).toEqual({ light: "#ffffff", dark: "#ffffff" });
    expect(palette.adjusted).toEqual({ light: false, dark: false });
  });

  it("darkens a pale yellow's buttons in light mode only", () => {
    const palette = brandPalette("#fff59d");

    expect(palette.tokens.solid).toEqual({ light: "#93882f", dark: "#fff59d" });
    expect(palette.tokens.focusRing).toEqual({ light: "#93882f", dark: "#fff59d" });
    expect(palette.tokens.contrast).toEqual({ light: "#000000", dark: "#000000" });
    expect(palette.adjusted).toEqual({ light: true, dark: false });
  });

  it("lightens a near-black's buttons in dark mode only", () => {
    const palette = brandPalette("#111111");

    expect(palette.tokens.solid).toEqual({ light: "#111111", dark: "#6f6f6f" });
    expect(palette.tokens.contrast).toEqual({ light: "#ffffff", dark: "#ffffff" });
    expect(palette.adjusted).toEqual({ light: false, dark: true });
  });
});

describe("contrastRatio", () => {
  it("is 21 for black on white and 1 for a color on itself", () => {
    expect(contrastRatio("#000000", "#ffffff")).toBeCloseTo(21, 5);
    expect(contrastRatio("#3b82f6", "#3b82f6")).toBeCloseTo(1, 5);
  });
});
