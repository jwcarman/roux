import { describe, expect, it } from "vitest";

describe("@jwcarman/roux-web/testing", () => {
  it("the testing entry exports the kit", async () => {
    expect(Object.keys(await import("./index")).sort()).toEqual([
      "TEST_USER",
      "badRequest",
      "checkAllAnswered",
      "invalidFields",
      "listen",
      "notFound",
      "pageOf",
      "paletteOf",
      "renderHookWithProviders",
      "renderWithProviders",
      "rulesFor",
      "server",
      "serverError",
      "settle",
      "signedInAs",
      "stale",
      "testQueryClient",
    ]);
  });
});
