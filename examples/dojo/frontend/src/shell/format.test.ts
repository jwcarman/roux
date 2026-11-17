import { describe, expect, it } from "vitest";
import { formatDate, formatDateTime, formatNumber, formatTime, yesNo } from "./format";

describe("display formats", () => {
  it("show a boolean as Yes or No", () => {
    expect(yesNo(true)).toBe("Yes");
    expect(yesNo(false)).toBe("No");
  });

  it("show a date on its own day, whatever the time zone", () => {
    expect(formatDate("2026-03-01")).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium" }).format(new Date(2026, 2, 1)),
    );
  });

  it("show an instant with its date and time", () => {
    expect(formatDateTime("2026-03-01T15:30:00Z")).toBe(
      new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" }).format(
        new Date("2026-03-01T15:30:00Z"),
      ),
    );
  });

  it("show a time of day in the reader's format, whatever the date", () => {
    expect(formatTime("16:30")).toBe(
      new Intl.DateTimeFormat(undefined, { timeStyle: "short" }).format(new Date(2000, 0, 1, 16, 30)),
    );
  });

  it("show a number in the reader's format", () => {
    expect(formatNumber(1234.5)).toBe(new Intl.NumberFormat().format(1234.5));
    expect(formatNumber(0)).toBe(new Intl.NumberFormat().format(0));
  });

  it("show nothing for a missing value", () => {
    expect(yesNo(null)).toBe("");
    expect(formatDate(null)).toBe("");
    expect(formatDateTime(null)).toBe("");
    expect(formatNumber(null)).toBe("");
  });
});
