import { contract } from "./contracts";

/** roux's words for a broken rule, shared with the server (contracts/messages.json). */
const messages = contract<Record<string, string>>("messages.json");

/**
 * The server's message for `constraint` (its short name: `"NotBlank"`, `"Size"`, `"URL"`, ...), with
 * its `{name}` placeholders filled from `args`.
 */
export function validationMessage(constraint: string, args: Record<string, string | number> = {}): string {
  const message = messages[constraint];
  if (message === undefined) {
    throw new Error(`${constraint} is not in contracts/messages.json`);
  }
  return message.replace(/\{(\w+)\}/g, (placeholder, name: string) =>
    name in args ? String(args[name]) : placeholder,
  );
}
