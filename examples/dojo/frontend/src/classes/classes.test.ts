import { describe, expect, it } from "vitest";
import { latestOn, WEEKDAY_LABELS, WEEKDAYS } from "./classes";

describe("latestOn", () => {
  const tuesday = new Date(2026, 10, 17, 12);

  it("is today when today is that weekday", () => {
    expect(latestOn("TUESDAY", tuesday)).toBe("2026-11-17");
  });

  it("is the last such day before today, across a month end", () => {
    expect(latestOn("MONDAY", tuesday)).toBe("2026-11-16");
    expect(latestOn("WEDNESDAY", tuesday)).toBe("2026-11-11");
    expect(latestOn("SUNDAY", new Date(2026, 11, 2, 12))).toBe("2026-11-29");
  });

  it("defaults to today", () => {
    const today = WEEKDAYS[(new Date().getDay() + 6) % 7];
    expect(latestOn(today)).toMatch(/^\d{4}-\d{2}-\d{2}$/);
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
