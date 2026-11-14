import type { ConfirmOptions } from "./ConfirmProvider";

/**
 * What to ask before removing something, with Remove as its destructive action:
 * `if (await confirm(removal(`Remove ${name}?`, "It will be removed from the list."))) remove()`.
 */
export function removal(title: string, message: string): ConfirmOptions {
  return { title, message, confirmLabel: "Remove", destructive: true };
}
