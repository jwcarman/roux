// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import { FONT_FAMILY, FONTS, loadFont } from "./fonts";

const fonts = { loaded: [] as string[] };

/** A stand-in for a font's stylesheet that records being loaded. */
function stylesheet(name: string) {
  return () => {
    fonts.loaded.push(name);
    return {};
  };
}

describe("fonts", () => {
  // Registered again for every test: resetModules keeps a mock's module, so a font loaded once would
  // never be counted again.
  beforeEach(() => {
    fonts.loaded.length = 0;
    vi.resetModules();
    vi.doMock("@fontsource-variable/inter", stylesheet("inter"));
    vi.doMock("@fontsource-variable/nunito", stylesheet("nunito"));
    vi.doMock("@fontsource-variable/lora", stylesheet("lora"));
  });

  it("offers four letterings, each with a font family", () => {
    expect(FONTS).toEqual(["standard", "modern", "friendly", "classic"]);
    expect(FONT_FAMILY.standard).toMatch(/^Inter, -apple-system/);
    expect(FONT_FAMILY.modern).toMatch(/^"Inter Variable", Inter, /);
    expect(FONT_FAMILY.friendly).toMatch(/^"Nunito Variable", Inter, /);
    expect(FONT_FAMILY.classic).toBe('"Lora Variable", Georgia, "Times New Roman", serif');
  });

  it.each([
    ["standard", []],
    ["modern", ["inter"]],
    ["friendly", ["nunito"]],
    ["classic", ["lora"]],
  ] as const)("loads only what the %s lettering needs", async (font, expected) => {
    const { loadFont: load } = await import("./fonts");
    await load(font);

    expect(fonts.loaded).toEqual(expected);
  });

  it("loads the bundled stylesheet at most once, and resolves with nothing", async () => {
    await expect(loadFont("modern")).resolves.toBeUndefined();
    await loadFont("modern");

    expect(fonts.loaded.filter((name) => name === "inter").length).toBeLessThanOrEqual(1);
  });
});
