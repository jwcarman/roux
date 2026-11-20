import { describe, expect, it } from "vitest";
import { latestOn, WEEKDAY_LABELS, WEEKDAYS } from "./classes";

describe("latestOn", () => {
  const tuesday = "2026-11-17";

  it("is today when today is that weekday", () => {
    expect(latestOn("TUESDAY", tuesday)).toBe("2026-11-17");
  });

  it("is the last such day before today, across a month end", () => {
    expect(latestOn("MONDAY", tuesday)).toBe("2026-11-16");
    expect(latestOn("WEDNESDAY", tuesday)).toBe("2026-11-11");
    expect(latestOn("SUNDAY", "2026-12-02")).toBe("2026-11-29");
  });

  it("defaults to the school's today", () => {
    expect(latestOn("MONDAY")).toBe("2026-06-15"); // the test school's today, a Monday
    expect(latestOn("FRIDAY")).toBe("2026-06-12");
  });
});

describe("WEEKDAY_LABELS", () => {
  it("writes each weekday as people do, Monday first", () => {
    expect(WEEKDAYS.map((weekday) => WEEKDAY_LABELS[weekday])).toEqual([
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
      "Sunday",
    ]);
  });
});
