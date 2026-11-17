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
