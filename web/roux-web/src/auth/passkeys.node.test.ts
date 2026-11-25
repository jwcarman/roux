import { describe, expect, it } from "vitest";
import { createAuthClient } from "./index";

// Node, not jsdom: there is no window at all, as during server rendering.
describe("passkeys.supported without a browser", () => {
  it("is false", () => {
    expect(createAuthClient().passkeys.supported()).toBe(false);
  });
});
