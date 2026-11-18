import { beforeEach, describe, expect, it, vi } from "vitest";

/*
 * The places brandPalette compares two numbers that no real color makes equal, so a mutation of the
 * comparison (">=" to ">") could only be noticed by a tie. These tests make the tie, by answering
 * the color library's measurements themselves.
 */
const measured = vi.hoisted(() => ({
  contrast: undefined as ((a: string, b: string) => number) | undefined,
  lightness: undefined as number | undefined,
}));

vi.mock("culori", async (importOriginal) => {
  const actual = await importOriginal<typeof import("culori")>();
  return {
    ...actual,
    wcagContrast: (a: string, b: string) => measured.contrast?.(a, b) ?? actual.wcagContrast(a, b),
    oklch: (color: string) => {
      const real = actual.oklch(color);
      return real && measured.lightness !== undefined ? { ...real, l: measured.lightness } : real;
    },
  };
});

const { brandPalette } = await import("./brandPalette");

describe("brandPalette at a tie", () => {
  beforeEach(() => {
    measured.contrast = undefined;
    measured.lightness = undefined;
  });

  it("puts black text on a color black and white read equally on", () => {
    measured.contrast = () => 5;

    expect(brandPalette("#3b82f6").tokens.contrast).toEqual({ light: "#000000", dark: "#000000" });
  });

  it("takes the lighter shade when two are equally near", () => {
    measured.lightness = 0.9;

    expect(brandPalette("#3b82f6").shades["100"]).toBe("#3b82f6");
    expect(brandPalette("#3b82f6").shades["200"]).not.toBe("#3b82f6");
  });
});
