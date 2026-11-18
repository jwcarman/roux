import { describe, expect, it } from "vitest";
import { dateTimeInputOf, inputOf, numberInputOf, timeInputOf } from "./values";

describe("form values", () => {
  it("start a number input from a record's value", () => {
    expect(numberInputOf(null)).toBeUndefined();
    expect(numberInputOf(0)).toBe(0);
  });

  it("start a text input from a record's value", () => {
    expect(inputOf(null)).toBe("");
    expect(inputOf("x")).toBe("x");
  });

  it("show an instant in a datetime-local input, in the browser's time zone", () => {
    const shown = dateTimeInputOf("2026-03-01T15:30:00Z");

    expect(shown).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/);
    expect(new Date(shown).toISOString()).toBe("2026-03-01T15:30:00.000Z");
  });

  it("leave an empty instant empty", () => {
    expect(dateTimeInputOf(null)).toBe("");
  });

  it("show a time without the server's seconds, and keep text that is not a time", () => {
    expect(timeInputOf("17:00:00")).toBe("17:00");
    expect(timeInputOf("06:05")).toBe("06:05");
    expect(timeInputOf(null)).toBe("");
    expect(timeInputOf("6pm")).toBe("6pm");
  });
});
