import { who } from "../who";

/** Registers a passkey for the signed-in caller under `label`. */
export function registerPasskey(label: string) {
  return who.me.passkeys.register(label);
}

/** The signed-in caller's passkeys, oldest first. */
export function listPasskeys() {
  return who.me.passkeys.list();
}

/** Removes one of the caller's passkeys by its credential id. */
export function removePasskey(credentialId: string) {
  return who.me.passkeys.remove(credentialId);
}

/** Signs in with a passkey the browser holds. */
export function signInWithPasskey() {
  return who.passkeys.signIn();
}
