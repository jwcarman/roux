/**
 * How the app writes dates, times, moments and numbers: in the organization's locale, a moment in
 * its time zone, and nothing for a missing value. Each reads the organization's context, so none
 * takes a locale or a zone.
 */
import { organization } from "../organization/organization";
import { parseIsoDate, parseIsoTime } from "./dates";

/**
 * A day (`2026-03-01`), written on that day whatever any zone (`Mar 1, 2026`); `""` for
 * `null`, and text that is not a date as it is.
 */
export function formatDate(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const { locale } = organization();
  const date = parseIsoDate(iso);
  // The day is read and written in the browser's own zone, so it never moves.
  return date === undefined ? iso : new Intl.DateTimeFormat(locale, { dateStyle: "medium" }).format(date);
}

/** A time of day (`16:30`, or a server's `16:30:00`), as the organization writes a time of day. */
export function formatTime(iso: string): string {
  const { locale } = organization();
  const time = parseIsoTime(iso);
  return time === undefined ? iso : new Intl.DateTimeFormat(locale, { timeStyle: "short" }).format(time);
}

/** An instant, with its date and time where the organization is (`Nov 20, 2026, 10:00 PM`); `""` for `null`. */
export function formatDateTime(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const { locale, timeZone } = organization();
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone }).format(new Date(iso));
}

/** The day an instant falls on where the organization is (`Nov 20, 2026`); `""` for `null`. */
export function formatInstantDate(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const { locale, timeZone } = organization();
  return new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeZone }).format(new Date(iso));
}

/** A number in the organization's locale (`1,234.5`); `""` for `null`. */
export function formatNumber(value: number | null): string {
  if (value === null) {
    return "";
  }
  return new Intl.NumberFormat(organization().locale).format(value);
}
