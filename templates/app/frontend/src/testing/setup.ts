// roux's test setup (the fake network, jest-dom, the test organization), imported so it shares the app's modules.
import "@jwcarman/roux-web/testing/setup";
import { afterEach } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";

// A toast outlives the test that raised it (the toaster is one store for the whole file), so each
// test starts with none.
afterEach(() => {
  toaster.remove();
});
