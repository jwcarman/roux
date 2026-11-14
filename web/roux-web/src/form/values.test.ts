import { describe, expect, it } from "vitest";
import { dateTimeInputOf, inputOf, instantOrNull, numberInputOf, numberOrNull, textOrNull } from "./values";

describe("form values", () => {
  it("send blank text as null and trim the rest", () => {
    expect(textOrNull("  ")).toBeNull();
    expect(textOrNull("")).toBeNull();
    expect(textOrNull(" a ")).toBe("a");
  });

  it("send an empty number as null", () => {
    expect(numberOrNull(undefined)).toBeNull();
    expect(numberOrNull(4.5)).toBe(4.5);
    expect(numberOrNull(0)).toBe(0);
  });

  it("start a number input from a record's value", () => {
    expect(numberInputOf(null)).toBeUndefined();
    expect(numberInputOf(0)).toBe(0);
  });

  it("start a text input from a record's value", () => {
    expect(inputOf(null)).toBe("");
    expect(inputOf("x")).toBe("x");
  });

  it("show an instant in a datetime-local input and give the same instant back", () => {
    const shown = dateTimeInputOf("2026-03-01T15:30:00Z");

    expect(shown).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(instantOrNull(shown)).toBe("2026-03-01T15:30:00.000Z");
  });

  it("leave an empty instant empty", () => {
    expect(dateTimeInputOf(null)).toBe("");
    expect(instantOrNull("")).toBeNull();
  });

  it("keeps an instant the input still shows, to the millisecond", () => {
    const saved = "2026-03-01T15:30:42.517Z";
    expect(instantOrNull(dateTimeInputOf(saved), saved)).toBe(saved);
    expect(instantOrNull("", null)).toBeNull();
  });

  it("takes a changed input over the instant it came from", () => {
    const saved = "2026-03-01T15:30:42.517Z";
    expect(instantOrNull("2026-03-02T09:15", saved)).toBe(new Date("2026-03-02T09:15").toISOString());
    expect(instantOrNull("", saved)).toBeNull();
  });
});
