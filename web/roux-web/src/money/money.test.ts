// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../testing/server";
import { moneyInputOf } from "../form/values";
import { currencySymbol, formatMoney, moneySettingsQuery, timesMoney } from "./money";

describe("money", () => {
  it("formats minor units in the currency", () => {
    expect(formatMoney({ minorUnits: 15000, currency: "USD" }, "en-US")).toBe("$150.00");
    expect(formatMoney({ minorUnits: 5, currency: "USD" }, "en-US")).toBe("$0.05");
    expect(formatMoney({ minorUnits: 0, currency: "USD" }, "en-US")).toBe("$0.00");
    expect(formatMoney({ minorUnits: -15050, currency: "USD" }, "en-US")).toBe("-$150.50");
    expect(formatMoney({ minorUnits: 150, currency: "JPY" }, "en-US")).toBe("¥150");
    expect(formatMoney({ minorUnits: 123456789, currency: "EUR" }, "de-DE")).toBe("1.234.567,89\u00a0€");
  });

  it("multiplies whole minor units", () => {
    expect(timesMoney({ minorUnits: 15000, currency: "USD" }, 3)).toEqual({ minorUnits: 45000, currency: "USD" });
  });

  it("names the currency's symbol", () => {
    expect(currencySymbol("USD")).toBe("$");
    expect(currencySymbol("JPY")).toBe("¥");
  });

  it("writes zero without a sign", () => {
    expect(moneyInputOf({ minorUnits: 0, currency: "USD" }, { currency: "USD", fractionDigits: 2 })).toBe("0.00");
  });

  it("reads the app's currency from GET /api/money", async () => {
    server.use(http.get("/api/money", () => HttpResponse.json({ currency: "USD", fractionDigits: 2 })));
    const queryFn = moneySettingsQuery.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;

    await expect(queryFn({ signal: new AbortController().signal })).resolves.toEqual({
      currency: "USD",
      fractionDigits: 2,
    });
  });

  it("can be abandoned: the read takes the query's abort signal", async () => {
    server.use(http.get("/api/money", () => HttpResponse.json({ currency: "USD", fractionDigits: 2 })));
    const controller = new AbortController();
    controller.abort();
    const queryFn = moneySettingsQuery.queryFn as (context: { signal: AbortSignal }) => Promise<unknown>;

    await expect(queryFn({ signal: controller.signal })).rejects.toThrow();
  });

  it("caches the app's currency for good", () => {
    expect(moneySettingsQuery.queryKey).toEqual(["roux", "money"]);
    expect(moneySettingsQuery.staleTime).toBe(Infinity);
  });
});
