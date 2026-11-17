/**
 * The server's message for a date in the future (`@PastOrPresent`, in roux's
 * ContributorValidationMessages). roux has no rule helper for it, so the schemas that need it
 * (`date().refine(notInTheFuture, ...)`) carry this text.
 */
export const NOT_IN_THE_FUTURE = "Must not be in the future";

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

/** Whether `value` (`YYYY-MM-DD`, or none) is today or earlier; no date is not in the future. */
export function notInTheFuture(value: string | null): boolean {
  return value === null || value <= todayIso();
}
