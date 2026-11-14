import { describe, expect, it } from "vitest";
import { removal } from "./removal";

describe("removal", () => {
  it("asks with Remove as a destructive action", () => {
    expect(removal("Remove Ann?", "She will be removed from the customers.")).toEqual({
      title: "Remove Ann?",
      message: "She will be removed from the customers.",
      confirmLabel: "Remove",
      destructive: true,
    });
  });
});
