/** How lists show values: in the reader's locale, and nothing for a missing value. */
import { parseIsoDate, parseIsoTime } from "@jwcarman/roux-web/dates";

const dates = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimes = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const times = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const numbers = new Intl.NumberFormat();

/** A `LocalDate` (`2026-03-01`), on that day whatever the reader's time zone; text that is not one is shown as it is. */
export function formatDate(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const date = parseIsoDate(iso);
  return date === undefined ? iso : dates.format(date);
}

/** A `LocalTime` (`16:30`, or the server's `16:30:00`), as the reader's locale writes a time of day. */
export function formatTime(iso: string): string {
  const time = parseIsoTime(iso);
  return time === undefined ? iso : times.format(time);
}

/** An instant, with its date and time in the reader's time zone. */
export function formatDateTime(iso: string | null): string {
  return iso === null ? "" : dateTimes.format(new Date(iso));
}

export function formatNumber(value: number | null): string {
  return value === null ? "" : numbers.format(value);
}

export function yesNo(value: boolean | null): string {
  if (value === null) {
    return "";
  }
  return value ? "Yes" : "No";
}
