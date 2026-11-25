import { describe, expect, it } from "vitest";
import { testQueryClient } from "@jwcarman/roux-web/testing";
import { createAppRouter } from "./App";

describe("createAppRouter", () => {
  it("loads a page's data when a link is pointed at, and restores scrolling on Back", () => {
    expect(createAppRouter(testQueryClient()).options).toMatchObject({
      defaultPreload: "intent",
      scrollRestoration: true,
    });
  });
});
