/// <reference types="vite/client" />
import { describe, expect, it } from "vitest";

/** Every app source file but the tests, by path. */
const SOURCES = Object.entries(
  import.meta.glob<string>(["./**/*.{ts,tsx}", "!./**/*.test.{ts,tsx}"], {
    query: "?raw",
    import: "default",
    eager: true,
  }),
);

describe("icons", () => {
  it("come from one set, Lucide (react-icons/lu), the set Chakra's own examples use", () => {
    expect(SOURCES.length).toBeGreaterThan(10);
    const offenders = SOURCES.filter(([, source]) =>
      [...source.matchAll(/from\s+["'](react-icons\/[^"']+)["']/g)].some(([, module]) => module !== "react-icons/lu"),
    ).map(([path]) => path);
    expect(offenders).toEqual([]);
  });
});
