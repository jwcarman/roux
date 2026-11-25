import { afterEach } from "vitest";
export { server } from "../testing/server";

// The CSRF cookie a test set goes with the test.
afterEach(clearCsrfCookie);

/** An absolute URL on the page's origin, as the client sends it. */
export function at(path: string): string {
  return new URL(path, location.href).href;
}

/** Sets the CSRF cookie the way the server's response would, as the browser stores it. */
export function setCsrfCookie(value: string): void {
  document.cookie = `XSRF-TOKEN=${value}; path=/`;
}

/** Removes the CSRF cookie. */
export function clearCsrfCookie(): void {
  document.cookie = "XSRF-TOKEN=; path=/; expires=Thu, 01 Jan 1970 00:00:00 GMT";
}
