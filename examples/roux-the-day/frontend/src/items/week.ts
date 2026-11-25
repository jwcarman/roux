/**
 * A week of days, Monday to Sunday, as the server's days travel (`2026-11-23`). The arithmetic is
 * on midnight UTC, so neither the browser's zone nor a daylight-saving change can move a day.
 */

const DAY_MS = 24 * 60 * 60 * 1000;

function utc(day: string): Date {
  return new Date(`${day}T00:00:00Z`);
}

function iso(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The day `n` days after `day`. */
export function addDays(day: string, n: number): string {
  return iso(new Date(utc(day).getTime() + n * DAY_MS));
}

/** The Monday of `day`'s week. */
export function mondayOf(day: string): string {
  const sinceMonday = (utc(day).getUTCDay() + 6) % 7;
  return addDays(day, -sinceMonday);
}

/** The seven days of the week that starts on `monday`. */
export function weekDays(monday: string): string[] {
  return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
}

const SHORT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const SHORT_YEAR = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  year: "numeric",
  timeZone: "UTC",
});
const WEEKDAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  timeZone: "UTC",
});
const LONG = new Intl.DateTimeFormat("en-US", {
  weekday: "long",
  month: "long",
  day: "numeric",
  timeZone: "UTC",
});

/** The week as its heading reads it: `Nov 23 – Nov 29, 2026`, with both years when they differ. */
export function weekRange(monday: string): string {
  const sunday = addDays(monday, 6);
  const sameYear = monday.slice(0, 4) === sunday.slice(0, 4);
  const first = (sameYear ? SHORT : SHORT_YEAR).format(utc(monday));
  return `${first} – ${SHORT_YEAR.format(utc(sunday))}`;
}

/** A day as its column heads it: `Mon` and `23`, and `Monday, November 23` for a screen reader. */
export function dayHeading(day: string): {
  weekday: string;
  day: string;
  label: string;
} {
  const date = utc(day);
  return {
    weekday: WEEKDAY.format(date),
    day: String(date.getUTCDate()),
    label: LONG.format(date),
  };
}
