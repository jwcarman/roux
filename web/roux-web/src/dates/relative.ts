import { organization } from "../organization/organization";

const UNITS: [Intl.RelativeTimeFormatUnit, number][] = [
  ["year", 365 * 24 * 3600],
  ["month", 30 * 24 * 3600],
  ["day", 24 * 3600],
  ["hour", 3600],
  ["minute", 60],
];

/**
 * How long before `now` (this device's time unless given) the moment `iso` was, in the
 * organization's language: "now", "5 minutes ago", "yesterday", "3 months ago". A moment less than a
 * minute ago, or a little ahead of this device's clock, is "now"; text that is not a moment is
 * returned as it is.
 */
export function formatRelativeTime(iso: string, now: Date = new Date()): string {
  const then = Date.parse(iso);
  if (Number.isNaN(then)) {
    return iso;
  }
  const format = new Intl.RelativeTimeFormat(organization().locale, { numeric: "auto" });
  const seconds = Math.round((now.getTime() - then) / 1000);
  for (const [unit, size] of UNITS) {
    if (seconds >= size) {
      return format.format(-Math.floor(seconds / size), unit);
    }
  }
  return format.format(0, "second");
}
