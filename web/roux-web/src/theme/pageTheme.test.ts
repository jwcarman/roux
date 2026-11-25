// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readPageTheme } from "./pageTheme";
import { DEFAULT_THEME, type ShellTheme } from "./theme";
import { inHead } from "../testing/head";

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

const SAVED: ShellTheme = {
  appName: "Dojo",
  palette: "brand",
  brandColor: "#ff8800",
  shape: "round",
  headingFont: "friendly",
  bodyFont: "modern",
};

const read = (theme: Record<string, unknown>) => () => readPageTheme(pageWith(JSON.stringify({ ...SAVED, ...theme })));

describe("readPageTheme", () => {
  it("reads the page's theme", () => {
    expect(readPageTheme(pageWith(JSON.stringify(SAVED)))).toEqual(SAVED);
  });

  it("reads the document by default", () => {
    inHead(`<script type="application/json" id="app-theme">${JSON.stringify(SAVED)}</script>`);

    expect(readPageTheme()).toEqual(SAVED);
  });

  it("is Chakra's stock look when the page carries no theme", () => {
    expect(readPageTheme(pageWith(null))).toBe(DEFAULT_THEME);
    expect(DEFAULT_THEME).toEqual({
      appName: "App",
      palette: "gray",
      brandColor: "#3b82f6",
      shape: "medium",
      headingFont: "standard",
      bodyFont: "standard",
    });
  });

  it("is the stock look when no server has filled the theme in (Vite's dev server)", () => {
    expect(readPageTheme(pageWith("__APP_THEME__"))).toBe(DEFAULT_THEME);
    expect(readPageTheme(pageWith("  __APP_THEME__\n"))).toBe(DEFAULT_THEME);
    expect(readPageTheme(pageWith(""))).toBe(DEFAULT_THEME);
    expect(readPageTheme(pageWith("   "))).toBe(DEFAULT_THEME);
  });

  it("refuses a theme that is not JSON, naming the page's theme", () => {
    expect(() => readPageTheme(pageWith("{oops"))).toThrow("The page's theme (#app-theme) is not JSON");
  });

  it.each(["null", "7", '"text"'])("refuses %s, which is not an object", (json) => {
    expect(() => readPageTheme(pageWith(json))).toThrow("is not an object");
  });

  it.each([{ appName: "  " }, { appName: 7 }, { appName: undefined }])("refuses an app name of %j", (theme) => {
    expect(read(theme)).toThrow("has no appName");
  });

  it.each(["red", "#12345", "#gggggg", "x#ff8800", "#ff88001", 7, undefined])(
    "refuses a brand color of %j",
    (brandColor) => {
      expect(read({ brandColor })).toThrow("has a brandColor");
      expect(read({ brandColor })).toThrow("that is not #rrggbb");
    },
  );

  it.each([
    ["palette", "mauve"],
    ["shape", "oval"],
    ["headingFont", "comic"],
    ["bodyFont", "comic"],
  ])("refuses an unknown %s, saying the server may be newer", (part, value) => {
    expect(read({ [part]: value })).toThrow(`has no ${part} "${value}"`);
    expect(read({ [part]: value })).toThrow("is the server newer than the app?");
  });

  it("refuses a missing part", () => {
    expect(read({ shape: undefined })).toThrow("has no shape undefined");
  });

  it("accepts an upper-case brand color", () => {
    expect(read({ brandColor: "#FF8800" })().brandColor).toBe("#FF8800");
  });

  it("lists what it knows, in the message", () => {
    expect(read({ palette: "mauve" })).toThrow("it knows gray, red, orange");
  });
});
