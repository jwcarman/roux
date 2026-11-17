/** `date` as an `<input type="date">` holds it: `YYYY-MM-DD`, in the browser's time zone. */
export function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

/** Today, as a date input holds it. */
export function todayIso(): string {
  return isoDate(new Date());
}

/** `value` when it is a real calendar date written `YYYY-MM-DD`, else undefined: a date from the URL. */
export function isoDateOf(value: unknown): string | undefined {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return undefined;
  }
  const [year, month, day] = value.split("-").map(Number);
  const date = new Date(year, month - 1, day);
  return isoDate(date) === value ? value : undefined;
}

/** Day-of-week numbers as `Date.getDay` gives them, by the names the server uses. */
const DAY_NUMBERS: Record<string, number> = {
  SUNDAY: 0,
  MONDAY: 1,
  TUESDAY: 2,
  WEDNESDAY: 3,
  THURSDAY: 4,
  FRIDAY: 5,
  SATURDAY: 6,
};

/** The most recent day, up to and including today, that falls on `weekday` (`"TUESDAY"`). */
export function latestOn(weekday: string, today: Date = new Date()): string {
  const back = (today.getDay() - DAY_NUMBERS[weekday] + 7) % 7;
  return isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() - back));
}
