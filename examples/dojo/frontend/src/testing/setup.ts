import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { setOrganization, testOrganization } from "@jwcarman/roux-web/organization";
import { checkAllAnswered, listen, server, settle } from "./server";

beforeAll(listen);

// Every test starts in the same school on the same day (2026-06-15); a test sets another with setOrganization.
beforeEach(() => setOrganization(testOrganization()));

afterEach(async () => {
  await settle();
  cleanup();
  server.resetHandlers();
  checkAllAnswered();
});

afterAll(() => server.close());

// What Chakra's components reach for that jsdom does not provide.
if (typeof window !== "undefined") {
  window.matchMedia ??= (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => undefined,
      removeListener: () => undefined,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      dispatchEvent: () => false,
    }) as MediaQueryList;
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  window.scrollTo = () => undefined; // jsdom has one, but it only logs "Not implemented"
  Element.prototype.scrollTo ??= () => undefined;
  Element.prototype.scrollIntoView ??= () => undefined;
}
