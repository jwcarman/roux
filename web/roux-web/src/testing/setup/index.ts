/**
 * The test setup for an app on roux. The app's own setup file imports it
 * (`import "@jwcarman/roux-web/testing/setup";` in `src/testing/setup.ts`, listed in Vitest's `setupFiles`), so
 * it shares the app's modules and brings jest-dom's matcher types. It adds jest-dom's matchers, starts the fake
 * network before the tests (a request no handler answers fails the test that sent it), sets the test
 * organization before each test, and after each waits for requests in flight, unmounts, drops the
 * test's handlers and checks every request was answered. It also gives jsdom what Chakra reaches for.
 */
import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, beforeEach } from "vitest";
import { setOrganization, testOrganization } from "../../organization/organization";
import { checkAllAnswered, listen, server, settle } from "../server";

beforeAll(listen);

// Every test starts in the same organization, on the same day; a test sets another with setOrganization.
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
  if (typeof window.matchMedia !== "function") {
    window.matchMedia = (query: string) =>
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
  }
  globalThis.ResizeObserver ??= class {
    observe(): void {}
    unobserve(): void {}
    disconnect(): void {}
  };
  window.scrollTo = () => undefined; // jsdom has one, but it only logs "Not implemented"
  if (typeof Element.prototype.scrollTo !== "function") Element.prototype.scrollTo = () => undefined;
  if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => undefined;
}
