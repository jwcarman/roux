// WebAuthn's JSON (the server's, from go-webauthn) carries bytes as base64url strings; the browser wants bytes.

/** Bytes from a base64url string, with or without padding. */
export function decode(text: string): Uint8Array<ArrayBuffer> {
  return Uint8Array.from(atob(text.replaceAll("-", "+").replaceAll("_", "/")), (c) => c.codePointAt(0) as number); // atob yields one byte per character, never an empty one
}

/** A base64url string, unpadded, from bytes. */
export function encode(bytes: ArrayBuffer): string {
  let binary = "";
  for (const byte of new Uint8Array(bytes)) {
    binary += String.fromCodePoint(byte);
  }
  // "=" appears only as padding, at the end
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}
