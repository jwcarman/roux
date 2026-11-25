import { vi } from "vitest";

/**
 * Makes `window.location.replace` a spy and leaves the rest of `location` as it is (the fake network
 * resolves relative URLs against it, and the sign-in link reads its hash). Undo with `vi.unstubAllGlobals()`.
 */
export function stubLocationReplace() {
  const replace = vi.fn<(url: string) => void>();
  const real = window.location;
  const fake = Object.defineProperties(
    { replace, toString: () => real.href },
    Object.fromEntries(
      ["href", "origin", "protocol", "host", "hostname", "port", "pathname", "search", "hash"].map((name) => [
        name,
        { get: () => real[name as "href"], enumerable: true },
      ]),
    ),
  );
  vi.stubGlobal("location", fake);
  return replace;
}
