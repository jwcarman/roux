import { beforeEach, describe, expect, it } from "vitest";
import { setOrganization, testOrganization } from "../organization/organization";
import { firstDayOfWeek } from "./week";

describe("firstDayOfWeek", () => {
  beforeEach(() => setOrganization(testOrganization()));

  it("is the Sunday of the week when the organization's week starts on Sunday", () => {
    expect(firstDayOfWeek("2026-11-25")).toBe("2026-11-22");
    expect(firstDayOfWeek("2026-11-22")).toBe("2026-11-22");
    expect(firstDayOfWeek("2026-11-28")).toBe("2026-11-22");
  });

  it("follows the organization's week start", () => {
    setOrganization(testOrganization({ weekStart: 1 }));
    expect(firstDayOfWeek("2026-11-22")).toBe("2026-11-16");
    expect(firstDayOfWeek("2026-11-25")).toBe("2026-11-23");
    setOrganization(testOrganization({ weekStart: 6 }));
    expect(firstDayOfWeek("2026-11-27")).toBe("2026-11-21");
  });

  it("crosses a month and a year", () => {
    setOrganization(testOrganization({ weekStart: 1 }));
    expect(firstDayOfWeek("2027-01-01")).toBe("2026-12-28");
  });

  it("refuses a day that is not a date, naming dateSearchOf", () => {
    expect(() => firstDayOfWeek("2026-02-30")).toThrow(/"2026-02-30" is not a date.*dateSearchOf/);
  });
});
