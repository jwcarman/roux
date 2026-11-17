import { describe, expect, it } from "vitest";
import { relativeTime } from "./relativeTime";

const NOW = new Date("2026-11-08T12:00:00Z");

describe("relativeTime", () => {
  it("says just now for under a minute", () => {
    expect(relativeTime(new Date("2026-11-08T11:59:30Z"), NOW)).toBe("just now");
  });

  it("counts minutes, hours and days ago", () => {
    expect(relativeTime(new Date("2026-11-08T11:55:00Z"), NOW)).toBe("5 minutes ago");
    expect(relativeTime(new Date("2026-11-08T09:00:00Z"), NOW)).toBe("3 hours ago");
    expect(relativeTime(new Date("2026-11-07T12:00:00Z"), NOW)).toBe("yesterday");
    expect(relativeTime(new Date("2026-11-05T12:00:00Z"), NOW)).toBe("3 days ago");
  });

  it("counts months and years ago", () => {
    expect(relativeTime(new Date("2026-08-08T12:00:00Z"), NOW)).toBe("3 months ago");
    expect(relativeTime(new Date("2024-11-08T12:00:00Z"), NOW)).toBe("2 years ago");
  });
});
