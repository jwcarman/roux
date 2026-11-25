import { describe, expect, it } from "vitest";
import { roleLabel } from "./users";

describe("roleLabel", () => {
  it("reads a role by its label, else by its name, and none as nothing", () => {
    expect(roleLabel("OWNER")).toBe("Owner");
    expect(roleLabel("USER")).toBe("User");
    expect(roleLabel("COACH")).toBe("COACH");
    expect(roleLabel(null)).toBe("");
  });
});
