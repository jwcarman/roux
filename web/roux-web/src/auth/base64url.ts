// WebAuthn's JSON (Spring Security's) carries bytes as base64url strings; the browser wants bytes.

/** Bytes from a base64url string, with or without padding. */
export function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
}

/** A base64url string, unpadded, from bytes. */
export function encode(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCharCode(byte);
  }
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}
