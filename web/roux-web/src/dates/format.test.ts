import { describe, expect, it } from "vitest";
import { clearOrganization, setOrganization, testOrganization } from "../organization/organization";
import { formatDate, formatDateTime, formatInstantDate, formatNumber, formatTime } from "./format";

describe("formatDate", () => {
  it("writes a date on its own day, in the organization's locale", () => {
    expect(formatDate("2026-03-01")).toBe("Mar 1, 2026");
    setOrganization(testOrganization({ locale: "fr-FR" }));
    expect(formatDate("2026-03-01")).toBe("1 mars 2026");
  });

  it("is the same day in a zone far from UTC", () => {
    setOrganization(testOrganization({ timeZone: "Pacific/Auckland" }));
    expect(formatDate("2026-03-01")).toBe("Mar 1, 2026");
    setOrganization(testOrganization({ timeZone: "Pacific/Honolulu" }));
    expect(formatDate("2026-03-01")).toBe("Mar 1, 2026");
  });

  it("writes nothing for no date and text that is not a date as it is", () => {
    expect(formatDate(null)).toBe("");
    expect(formatDate("soon")).toBe("soon");
  });
});

describe("formatDateTime", () => {
  it("writes a moment in the organization's zone", () => {
    expect(formatDateTime("2026-11-21T03:00:00Z")).toBe("Nov 20, 2026, 10:00 PM");
    setOrganization(testOrganization({ timeZone: "Pacific/Auckland" }));
    expect(formatDateTime("2026-11-21T03:00:00Z")).toBe("Nov 21, 2026, 4:00 PM");
  });

  it("writes nothing for no moment", () => {
    expect(formatDateTime(null)).toBe("");
  });
});

describe("formatInstantDate", () => {
  it("writes the day a moment falls on in the organization's zone, without the time", () => {
    expect(formatInstantDate("2026-11-21T03:00:00Z")).toBe("Nov 20, 2026");
    setOrganization(testOrganization({ timeZone: "Pacific/Auckland", locale: "fr-FR" }));
    expect(formatInstantDate("2026-11-21T03:00:00Z")).toBe("21 nov. 2026");
  });

  it("writes nothing for no moment", () => {
    expect(formatInstantDate(null)).toBe("");
  });
});

describe("formatTime", () => {
  it("writes a time of day in the organization's locale", () => {
    expect(formatTime("16:30")).toBe("4:30 PM");
    expect(formatTime("16:30:00")).toBe("4:30 PM");
    setOrganization(testOrganization({ locale: "fr-FR" }));
    expect(formatTime("16:30")).toBe("16:30");
  });

  it("writes text that is not a time as it is", () => {
    expect(formatTime("later")).toBe("later");
  });
});

describe("formatNumber", () => {
  it("writes a number in the organization's locale, and nothing for none", () => {
    expect(formatNumber(1234.5)).toBe("1,234.5");
    setOrganization(testOrganization({ locale: "de-DE" }));
    expect(formatNumber(1234.5)).toBe("1.234,5");
    expect(formatNumber(null)).toBe("");
  });
});

describe("the formatters", () => {
  it("need a context", () => {
    clearOrganization();
    expect(() => formatDate("2026-03-01")).toThrow("No organization context");
  });
});
