import { describe, expect, it } from "vitest";
import { dayHeading, mondayOf, weekDays, weekRange } from "./week";

describe("the week", () => {
  it("starts on the Monday of any day's week, Sunday included", () => {
    expect(mondayOf("2026-11-23")).toBe("2026-11-23");
    expect(mondayOf("2026-11-25")).toBe("2026-11-23");
    expect(mondayOf("2026-11-29")).toBe("2026-11-23");
    expect(mondayOf("2026-11-30")).toBe("2026-11-30");
    expect(mondayOf("2027-01-02")).toBe("2026-12-28");
  });

  it("runs seven days from its Monday, across a month and a daylight-saving change", () => {
    expect(weekDays("2026-10-26")).toEqual([
      "2026-10-26",
      "2026-10-27",
      "2026-10-28",
      "2026-10-29",
      "2026-10-30",
      "2026-10-31",
      "2026-11-01",
    ]);
  });

  it("names its first and last day, and each day as a column heads it", () => {
    expect(weekRange("2026-11-23")).toBe("Nov 23 – Nov 29, 2026");
    expect(weekRange("2026-12-28")).toBe("Dec 28, 2026 – Jan 3, 2027");
    expect(dayHeading("2026-11-23")).toEqual({
      weekday: "Mon",
      day: "23",
      label: "Monday, November 23",
    });
  });
});
