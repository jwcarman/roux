import { describe, expect, it } from "vitest";
import { numberTextOf } from "./NumberField";

describe("numberTextOf", () => {
  it("shows nothing for an undefined value", () => {
    expect(numberTextOf(undefined)).toBe("");
  });

  it("shows a number as written, zero included", () => {
    expect(numberTextOf(42)).toBe("42");
    expect(numberTextOf(0)).toBe("0");
  });
});
