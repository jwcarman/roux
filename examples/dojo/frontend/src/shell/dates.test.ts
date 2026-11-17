import { afterEach, describe, expect, it, vi } from "vitest";
import { isoDate, notInTheFuture, todayIso } from "./dates";

describe("dates", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("writes a date as a date input does, padded, in local time", () => {
    expect(isoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("accepts today, an earlier day and no date, and refuses tomorrow", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 10, 17, 12));

    expect(todayIso()).toBe("2026-11-17");
    expect(notInTheFuture("2026-11-17")).toBe(true);
    expect(notInTheFuture("2020-01-01")).toBe(true);
    expect(notInTheFuture(null)).toBe(true);
    expect(notInTheFuture("2026-11-18")).toBe(false);
  });
});
