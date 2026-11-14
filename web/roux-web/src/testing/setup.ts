import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { checkAllAnswered, listen, server, settle } from "./server";

beforeAll(listen);

afterEach(async () => {
  await settle();
  cleanup();
  server.resetHandlers();
  checkAllAnswered();
});

afterAll(() => server.close());

// What Chakra's components reach for that jsdom does not provide.
if (typeof window !== "undefined") {
  if (!Reflect.has(window, "matchMedia")) {
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
  if (!Reflect.has(Element.prototype, "scrollTo")) Element.prototype.scrollTo = () => undefined;
  if (!Reflect.has(Element.prototype, "scrollIntoView")) Element.prototype.scrollIntoView = () => undefined;
}
