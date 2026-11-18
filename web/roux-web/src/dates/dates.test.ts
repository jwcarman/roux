import { describe, expect, it } from "vitest";
import { formatIsoDate, formatIsoTime, parseIsoDate, parseIsoTime } from "./dates";

describe("parseIsoDate", () => {
  it("reads a real date as midnight in the local zone", () => {
    const date = parseIsoDate("2026-11-17");
    expect(date).toEqual(new Date(2026, 10, 17));
  });

  it.each(["2026-02-30", "2026-13-01", "2026-2-3", "26-02-03", "2026-02-03T10:00", "", " 2026-02-03", "soon"])(
    "refuses %j",
    (text) => {
      expect(parseIsoDate(text)).toBeUndefined();
    },
  );

  it("knows leap days", () => {
    expect(parseIsoDate("2028-02-29")).toBeDefined();
    expect(parseIsoDate("2027-02-29")).toBeUndefined();
  });
});

describe("formatIsoDate", () => {
  it("writes the local calendar day, padded", () => {
    expect(formatIsoDate(new Date(2026, 0, 5, 23, 59))).toBe("2026-01-05");
  });

  it("round-trips with parseIsoDate", () => {
    expect(formatIsoDate(parseIsoDate("2026-11-17") ?? new Date(0))).toBe("2026-11-17");
  });
});

describe("parseIsoTime", () => {
  it("reads HH:mm and the server's HH:mm:ss", () => {
    expect(formatIsoTime(parseIsoTime("18:30") ?? new Date(0))).toBe("18:30");
    expect(formatIsoTime(parseIsoTime("18:30:00") ?? new Date(0))).toBe("18:30");
    expect(parseIsoTime("00:00")?.getHours()).toBe(0);
    expect(parseIsoTime("23:59")?.getMinutes()).toBe(59);
  });

  it.each(["24:00", "6:30", "18:60", "18:30:60", "18:30:00.5", "6pm", "", "18:30 "])("refuses %j", (text) => {
    expect(parseIsoTime(text)).toBeUndefined();
  });
});

describe("formatIsoTime", () => {
  it("writes hours and minutes, padded, dropping seconds", () => {
    expect(formatIsoTime(new Date(2026, 0, 1, 6, 5, 59))).toBe("06:05");
  });
});
