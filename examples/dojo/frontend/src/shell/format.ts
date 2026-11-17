/** How lists show values: in the reader's locale, and nothing for a missing value. */

const dates = new Intl.DateTimeFormat(undefined, { dateStyle: "medium" });
const dateTimes = new Intl.DateTimeFormat(undefined, { dateStyle: "medium", timeStyle: "short" });
const times = new Intl.DateTimeFormat(undefined, { timeStyle: "short" });
const numbers = new Intl.NumberFormat();

/** A `LocalDate` (`2026-03-01`), on that day whatever the reader's time zone. */
export function formatDate(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const [year, month, day] = iso.split("-").map(Number);
  return dates.format(new Date(year, month - 1, day));
}

/** A `LocalTime` (`16:30`), as the reader's locale writes a time of day. */
export function formatTime(hhmm: string): string {
  const [hours, minutes] = hhmm.split(":").map(Number);
  return times.format(new Date(2000, 0, 1, hours, minutes));
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
