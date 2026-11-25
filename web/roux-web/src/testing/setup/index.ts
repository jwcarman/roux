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
import { checkAllAnswered, listen, server, settle, stop } from "../server";

beforeAll(listen);

// Every test starts in the same organization, on the same day; a test sets another with setOrganization.
beforeEach(() => setOrganization(testOrganization()));

afterEach(async () => {
  await settle();
  cleanup();
  server.resetHandlers();
  forgetTheBrowser();
  checkAllAnswered();
});

/** Test files share one document: what a test left in the browser (cookies, storage) goes with it. */
function forgetTheBrowser(): void {
  if (typeof document === "undefined") {
    return;
  }
  for (const cookie of document.cookie.split(";")) {
    const name = cookie.split("=")[0].trim();
    if (name !== "") {
      document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/`;
    }
  }
  localStorage.clear();
  sessionStorage.clear();
}

afterAll(() => {
  stop();
  // Test files share one document: a file's styles go with it, so the next file's are its own. Each
  // ThemeProvider has an Emotion cache of its own, which writes its styles again.
  if (typeof document !== "undefined") {
    for (const style of document.querySelectorAll("style[data-emotion]")) {
      style.remove();
    }
  }
});

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
    // jsdom lays nothing out, so there is never a size change to report
    observe(): void {
      // nothing to watch
    }
    unobserve(): void {
      // nothing watched
    }
    disconnect(): void {
      // nothing to let go of
    }
  };
  window.scrollTo = () => undefined; // jsdom has one, but it only logs "Not implemented"
  if (typeof Element.prototype.scrollTo !== "function") Element.prototype.scrollTo = () => undefined;
  if (typeof Element.prototype.scrollIntoView !== "function") Element.prototype.scrollIntoView = () => undefined;
}
