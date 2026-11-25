/**
 * ISO strings (the wire format) and date-fns Dates (what an app does arithmetic and display with).
 * A day travels as `2026-11-17` and a time of day as `18:30` (or `18:30:00`, which a server
 * may send); an instant is an ISO string `new Date(iso)` reads. The helpers here are strict: a
 * string that is not a real date or time is `undefined`, never a rolled-over date.
 */
import { format, isValid, parse } from "date-fns";

const DATE_PATTERN = "yyyy-MM-dd";
const TIME_PATTERN = "HH:mm";
const TIME_WITH_SECONDS_PATTERN = "HH:mm:ss";

/** Any fixed day: a time of day is read onto it, and only its hours and minutes mean anything. */
const REFERENCE_DAY = new Date(2000, 0, 1);

/** The date `text` spells in `pattern`, when writing it back gives `text` (so `2026-02-30` and `2026-2-3` are not dates). */
function strictParse(text: string, pattern: string, reference: Date): Date | undefined {
  const date = parse(text, pattern, reference);
  return isValid(date) && format(date, pattern) === text ? date : undefined;
}

/** A day string (`2026-11-17`) as a Date at midnight in the browser's time zone; `undefined` unless it is a real calendar date. */
export function parseIsoDate(iso: string): Date | undefined {
  return strictParse(iso, DATE_PATTERN, REFERENCE_DAY);
}

/** A Date's calendar day in the browser's time zone as a day string (`2026-11-17`). */
export function formatIsoDate(date: Date): string {
  return format(date, DATE_PATTERN);
}

/**
 * A time-of-day string (`18:30`, or `18:30:00` as a server may write it) as a Date on an arbitrary
 * day; `undefined` unless it is a real time of day.
 */
export function parseIsoTime(iso: string): Date | undefined {
  return strictParse(iso, TIME_PATTERN, REFERENCE_DAY) ?? strictParse(iso, TIME_WITH_SECONDS_PATTERN, REFERENCE_DAY);
}

/** A Date's time of day as a time-of-day string (`18:30`), which is also what `<input type="time">` holds. */
export function formatIsoTime(date: Date): string {
  return format(date, TIME_PATTERN);
}
