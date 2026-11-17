import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate, isoDateOf, todayIso } from "./dates";

describe("dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a date as a date input does, padded, in local time", () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("gives today in local time", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 17, 12));

    expect(todayIso()).toBe("2026-11-17");
  });

  it("takes a date from the URL only when it is a real one", () => {
    expect(isoDateOf("2026-03-10")).toBe("2026-03-10");
    expect(isoDateOf("2026-02-30")).toBeUndefined();
    expect(isoDateOf("2026-3-10")).toBeUndefined();
    expect(isoDateOf("tuesday")).toBeUndefined();
    expect(isoDateOf(20260310)).toBeUndefined();
    expect(isoDateOf(undefined)).toBeUndefined();
  });
});
