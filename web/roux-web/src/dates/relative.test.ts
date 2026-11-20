import { describe, expect, it } from "vitest";
import { setOrganization, testOrganization } from "../organization";
import { formatRelativeTime } from "./relative";

const NOW = new Date("2026-11-08T12:00:00Z");

describe("formatRelativeTime", () => {
  it("writes in the organization's language", () => {
    setOrganization(testOrganization({ locale: "fr-FR" }));
    expect(formatRelativeTime("2026-11-08T11:55:00Z", NOW)).toBe("il y a 5 minutes");
    expect(formatRelativeTime("2026-11-08T11:59:30Z", NOW)).toBe("maintenant");
  });

  it("says now for under a minute, and for a moment a little ahead of this device", () => {
    expect(formatRelativeTime("2026-11-08T11:59:30Z", NOW)).toBe("now");
    expect(formatRelativeTime("2026-11-08T12:00:20Z", NOW)).toBe("now");
  });

  it("counts minutes, hours and days ago", () => {
    expect(formatRelativeTime("2026-11-08T11:59:00Z", NOW)).toBe("1 minute ago");
    expect(formatRelativeTime("2026-11-08T11:55:00Z", NOW)).toBe("5 minutes ago");
    expect(formatRelativeTime("2026-11-08T09:00:00Z", NOW)).toBe("3 hours ago");
    expect(formatRelativeTime("2026-11-07T12:00:00Z", NOW)).toBe("yesterday");
    expect(formatRelativeTime("2026-11-05T12:00:00Z", NOW)).toBe("3 days ago");
  });

  it("counts months and years ago", () => {
    expect(formatRelativeTime("2026-10-09T12:00:00Z", NOW)).toBe("last month");
    expect(formatRelativeTime("2026-08-08T12:00:00Z", NOW)).toBe("3 months ago");
    expect(formatRelativeTime("2025-11-08T12:00:00Z", NOW)).toBe("last year");
    expect(formatRelativeTime("2024-11-08T12:00:00Z", NOW)).toBe("2 years ago");
  });

  it("counts from this device's time unless given one", () => {
    expect(formatRelativeTime(new Date().toISOString())).toBe("now");
  });

  it("leaves text that is not a moment as it is, as the other formatters do", () => {
    expect(formatRelativeTime("yesterday")).toBe("yesterday");
  });
});
