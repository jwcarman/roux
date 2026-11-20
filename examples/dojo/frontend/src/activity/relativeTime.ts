import { organization } from "@jwcarman/roux-web/organization";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/** In the school's language: "just now", "5 minutes ago", "yesterday", "3 months ago": how long before `now` `then` was. */
export function relativeTime(then: Date, now: Date = new Date()): string {
  const seconds = Math.round((now.getTime() - then.getTime()) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return new Intl.RelativeTimeFormat(organization().locale, {
        numeric: "auto",
      }).format(-Math.floor(seconds / size), unit);
    }
  }
  return "just now";
}
