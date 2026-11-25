import { auth } from "./auth";

/** The longest passkey label who takes. */
export const PASSKEY_LABEL_MAX = 64;

/**
 * Why a passkey label is not one who will take (1 to {@link PASSKEY_LABEL_MAX} characters, not
 * blank, no control characters), or `undefined` when it is. Checked on the trimmed label, as that
 * is what is registered: the browser creates the passkey before who sees the label, so a refusal
 * there would leave a passkey on the device that who does not know.
 */
export function passkeyLabelError(label: string): string | undefined {
  const trimmed = label.trim();
  if (!trimmed) return "Name this passkey, such as the device it is on";
  if (trimmed.length > PASSKEY_LABEL_MAX) return `Must be at most ${PASSKEY_LABEL_MAX} characters`;
  if (/\p{Cc}/u.test(trimmed)) return "Must not contain control characters";
  return undefined;
}

/** Registers a passkey for the signed-in caller under `label`. */
export function registerPasskey(label: string) {
  return auth.me.passkeys.register(label);
}

/** The signed-in caller's passkeys, oldest first. */
export function listPasskeys() {
  return auth.me.passkeys.list();
}

/** Removes one of the caller's passkeys by its credential id. */
export function removePasskey(credentialId: string) {
  return auth.me.passkeys.remove(credentialId);
}
