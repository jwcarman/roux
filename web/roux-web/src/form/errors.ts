import type { Problem } from "../problem/problem";

/** What a field shows when a validator returns something without a readable message. */
const UNREADABLE = "Invalid value";

/**
 * The messages to show for a field's errors. Validators return strings, or objects with a
 * `message` (as schema validators do), or lists of either; empty entries and repeats are dropped.
 */
export function errorMessages(errors: readonly unknown[]): string[] {
  const messages: string[] = [];
  const visit = (error: unknown) => {
    if (Array.isArray(error)) {
      error.forEach(visit);
    } else if (typeof error === "string") {
      messages.push(error);
    } else if (error !== null && typeof error === "object") {
      const message = (error as { message?: unknown }).message;
      messages.push(typeof message === "string" ? message : UNREADABLE);
    }
  };
  errors.forEach(visit);
  return [...new Set(messages.filter((message) => message.trim() !== ""))];
}

/** A problem's field errors, the first message for each field, as `useSchemaForm` places them. */
export function fieldErrorsOf(problem: Problem): Record<string, string> {
  const fields: Record<string, string> = {};
  for (const { field, message } of problem.errors ?? []) {
    fields[field] ??= message;
  }
  return fields;
}
