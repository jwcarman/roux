import { describe, expect, it } from "vitest";

describe("@jwcarman/roux-web/testing", () => {
  it("the testing entry exports the kit", async () => {
    expect(Object.keys(await import("./index")).sort()).toEqual([
      "checkAllAnswered",
      "invalidFields",
      "invariantViolation",
      "listen",
      "notFound",
      "pageOf",
      "renderHookWithProviders",
      "renderWithProviders",
      "server",
      "serverError",
      "settle",
      "stale",
      "testQueryClient",
    ]);
  });
});
