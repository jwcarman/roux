/**
 * Form values to and from a record's. Inputs hold strings (and NumberField `number | undefined`);
 * the API takes `null` for an empty optional field, never `""`.
 */

/** Trimmed text, or null when blank. */
export function textOrNull(value: string): string | null {
  const text = value.trim();
  return text === "" ? null : text;
}

/** A number input's value, or null when empty. */
export function numberOrNull(value: number | undefined): number | null {
  return value ?? null;
}

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

/**
 * A `datetime-local` input's value (the browser's time zone) as an ISO instant, or null. The input
 * shows minutes only, so an input that still shows `original` gives `original` back whole: saving a
 * form must not drop the seconds of an instant nobody changed.
 */
export function instantOrNull(local: string, original: string | null = null): string | null {
  if (local === dateTimeInputOf(original)) {
    return original;
  }
  return local === "" ? null : new Date(local).toISOString();
}
