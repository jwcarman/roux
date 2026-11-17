import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate, todayIso } from "./dates";

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
});
