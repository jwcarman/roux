import { describe, expect, it } from "vitest";
import { LOOKS } from "./looks";

describe("LOOKS", () => {
  it("offers the five ready-made looks", () => {
    expect(LOOKS.map((look) => [look.name, look.settings])).toEqual([
      ["Clean", { palette: "gray", shape: "medium", headingFont: "standard", bodyFont: "standard" }],
      ["Friendly", { palette: "teal", shape: "round", headingFont: "friendly", bodyFont: "friendly" }],
      ["Bold", { palette: "purple", shape: "square", headingFont: "modern", bodyFont: "modern" }],
      ["Calm", { palette: "blue", shape: "slight", headingFont: "standard", bodyFont: "standard" }],
      ["Classic", { palette: "green", shape: "slight", headingFont: "classic", bodyFont: "standard" }],
    ]);
  });
});
