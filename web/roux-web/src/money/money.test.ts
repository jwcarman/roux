// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { moneyInputOf } from "../form/values";
import { clearOrganization, setOrganization, testOrganization } from "../organization/organization";
import { currencySymbol, formatMoney, timesMoney } from "./money";

describe("money", () => {
  it("formats minor units in the organization's locale", () => {
    expect(formatMoney({ minorUnits: 15000, currency: "USD" })).toBe("$150.00");
    expect(formatMoney({ minorUnits: 5, currency: "USD" })).toBe("$0.05");
    expect(formatMoney({ minorUnits: 0, currency: "USD" })).toBe("$0.00");
    expect(formatMoney({ minorUnits: -15050, currency: "USD" })).toBe("-$150.50");
    setOrganization(testOrganization({ locale: "de-DE", currency: "EUR" }));
    expect(formatMoney({ minorUnits: 123456789, currency: "EUR" })).toBe("1.234.567,89\u00a0€");
  });

  it("formats with the server's digits for the organization's currency", () => {
    // ISO 4217 gives HUF two digits; the browser's CLDR gives it none.
    setOrganization(testOrganization({ currency: "HUF", fractionDigits: 2 }));
    expect(formatMoney({ minorUnits: 150000, currency: "HUF" })).toMatch(/1,500\.00/);
    setOrganization(testOrganization({ currency: "JPY", fractionDigits: 0 }));
    expect(formatMoney({ minorUnits: 150, currency: "JPY" })).toBe("¥150");
  });

  it("formats another currency with its own digits", () => {
    expect(formatMoney({ minorUnits: 150, currency: "JPY" })).toBe("¥150");
    setOrganization(testOrganization({ currency: null, fractionDigits: null }));
    expect(formatMoney({ minorUnits: 15000, currency: "USD" })).toBe("$150.00");
  });

  it("needs a context", () => {
    clearOrganization();
    expect(() => formatMoney({ minorUnits: 1, currency: "USD" })).toThrow("No organization context");
  });

  it("multiplies whole minor units", () => {
    expect(timesMoney({ minorUnits: 15000, currency: "USD" }, 3)).toEqual({ minorUnits: 45000, currency: "USD" });
  });

  it("names the currency's symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("JPY")).toBe("¥");
  });

  it("writes zero without a sign", () => {
    expect(moneyInputOf({ minorUnits: 0, currency: "USD" })).toBe("0.00");
  });
});
