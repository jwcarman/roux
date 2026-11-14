/**
 * A record's values as inputs hold them: strings (and NumberField's `number | undefined`). The
 * schema's parse turns them back into the request.
 */

/** A record's number as a number input's value. */
export function numberInputOf(value: number | null): number | undefined {
  return value ?? undefined;
}

/** A record's text as an input's value. */
export function inputOf(value: string | null): string {
  return value ?? "";
}

const pad = (n: number) => String(n).padStart(2, "0");

/** An ISO instant as a `datetime-local` input's value, in the browser's time zone. */
export function dateTimeInputOf(iso: string | null): string {
  if (iso === null) {
    return "";
  }
  const d = new Date(iso);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
