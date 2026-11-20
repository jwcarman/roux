import { queryOptions } from "@tanstack/react-query";
import { getJson } from "../api/client";

/**
 * An amount of money: whole minor units of its currency (cents for USD), never a fraction. The
 * server's `Money`, as it travels: `{ minorUnits: 15000, currency: "USD" }`.
 */
export interface Money {
  minorUnits: number;
  currency: string;
}

/** The app's one currency (`roux.money.currency`), from `GET /api/money`. */
export interface MoneySettings {
  currency: string;
  fractionDigits: number;
}

/** How many minor-unit digits `currency` has (2 for USD, 0 for JPY). */
function digitsOf(currency: string): number {
  return new Intl.NumberFormat("en", { style: "currency", currency })
    .formatToParts(0)
    .filter((part) => part.type === "fraction")
    .reduce((count, part) => count + part.value.length, 0);
}

/** `minorUnits` as decimal text (`15050` → `"150.50"`), by string arithmetic: no floating point. */
export function decimalTextOf(minorUnits: number, fractionDigits: number): string {
  const sign = minorUnits < 0 ? "-" : "";
  const digits = String(Math.abs(minorUnits)).padStart(fractionDigits + 1, "0");
  if (fractionDigits === 0) {
    return sign + digits;
  }
  return `${sign}${digits.slice(0, -fractionDigits)}.${digits.slice(-fractionDigits)}`;
}

/** `money` in the reader's locale (or `locale`): `$150.00`, `¥150`, `1.234,56 €`. */
export function formatMoney(money: Money, locale?: string): string {
  const text = decimalTextOf(money.minorUnits, digitsOf(money.currency));
  // A decimal string, not a number, so no amount passes through floating point on its way out.
  return new Intl.NumberFormat(locale, { style: "currency", currency: money.currency }).format(
    text as unknown as number,
  );
}

/** `money` `n` times (a price for `n` periods). */
export function timesMoney(money: Money, n: number): Money {
  return { minorUnits: money.minorUnits * n, currency: money.currency };
}

/** The currency's narrow symbol (`$`, `¥`), as a money field shows it. */
export function currencySymbol(currency: string): string {
  return new Intl.NumberFormat("en", { style: "currency", currency, currencyDisplay: "narrowSymbol" })
    .formatToParts(0)
    .filter((part) => part.type === "currency")
    .map((part) => part.value)
    .join("");
}

/** The app's currency; it never changes while the app runs. */
export const moneySettingsQuery = queryOptions({
  queryKey: ["roux", "money"] as const,
  queryFn: ({ signal }) => getJson<MoneySettings>("money", { signal }),
  staleTime: Infinity,
});
