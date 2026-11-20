import { describe, expect, it } from "vitest";
import {
  setOrganization,
  testOrganization,
} from "@jwcarman/roux-web/organization";
import { formatMonth } from "./payments";

describe("formatMonth", () => {
  it("writes a month as the school does", () => {
    expect(formatMonth("2026-04")).toBe("Apr 2026");
    setOrganization(testOrganization({ locale: "fr-FR" }));
    expect(formatMonth("2026-04")).toBe("avr. 2026");
  });
});
