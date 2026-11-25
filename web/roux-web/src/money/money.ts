import { organization } from "../organization/organization";

/**
 * An amount of money: whole minor units of its currency (cents for USD), never a fraction. The
 * server's `Money`, as it travels: `{ minorUnits: 15000, currency: "USD" }`.
 */
export interface Money {
  minorUnits: number;
  currency: string;
}

/** The organization's currency (`ORG_CURRENCY`) and its digits, from the context. */
export function organizationCurrency(): { currency: string; fractionDigits: number } {
  const { currency, fractionDigits } = organization();
  if (currency === null) {
    throw new Error(
      "ORG_CURRENCY is not set: the organization has no currency (set it on the server, such as ORG_CURRENCY=USD)",
    );
  }
  // The context carries a currency with its digits, never one without the other.
  return { currency, fractionDigits: fractionDigits as number };
}

/**
 * How many minor-unit digits `currency` has: the server's (ISO 4217) for the organization's own
 * currency, the browser's for any other.
 */
export function digitsOf(currency: string): number {
  const context = organization();
  return context.currency === currency ? (context.fractionDigits as number) : intlDigitsOf(currency);
}

/** The browser's (CLDR's) digits for `currency`. */
function intlDigitsOf(currency: string): number {
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

/** `money` in the organization's locale, with its currency's digits: `$150.00`, `¥150`, `1.234,56 €`. */
export function formatMoney(money: Money): string {
  const digits = digitsOf(money.currency);
  const text = decimalTextOf(money.minorUnits, digits);
  // A decimal string, not a number, so no amount passes through floating point on its way out.
  return new Intl.NumberFormat(organization().locale, {
    style: "currency",
    currency: money.currency,
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(text as unknown as number);
}

/** `money` `n` times (a price for `n` periods). */
export function timesMoney(money: Money, n: number): Money {
  return { minorUnits: money.minorUnits * n, currency: money.currency };
}

/** The currency's narrow symbol (`$`, `¥`), as a money field shows it. */
export function currencySymbol(currency: string): string {
  // Zero with no fraction digits, less the zero, is the symbol alone.
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    currencyDisplay: "narrowSymbol",
    maximumFractionDigits: 0,
  })
    .format(0)
    .replace("0", "");
}
