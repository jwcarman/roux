import { describe, expect, it } from "vitest";
import { LOOKS } from "./looks";

describe("LOOKS", () => {
  it("offers the five ready-made looks", () => {
    expect(LOOKS.map((look) => [look.name, look.settings])).toEqual([
      ["Clean", { palette: "gray", shape: "medium", depth: "flat", headingFont: "standard", bodyFont: "standard" }],
      ["Friendly", { palette: "teal", shape: "round", depth: "raised", headingFont: "friendly", bodyFont: "friendly" }],
      ["Bold", { palette: "purple", shape: "square", depth: "flat", headingFont: "modern", bodyFont: "modern" }],
      ["Calm", { palette: "blue", shape: "slight", depth: "raised", headingFont: "standard", bodyFont: "standard" }],
      ["Classic", { palette: "green", shape: "slight", depth: "flat", headingFont: "classic", bodyFont: "standard" }],
    ]);
  });
});
