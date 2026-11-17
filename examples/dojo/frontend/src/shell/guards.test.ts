import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import type { Me } from "../api";
import { MEMBERS_READ } from "../api";
import { requirePermission, requireSignedIn, requireSignedOut } from "./guards";

const member: Me = { identityId: "ada", permissions: [MEMBERS_READ] };
const outsider: Me = { identityId: "eve", permissions: [] };

function redirectOf(guard: () => unknown): string | undefined {
  try {
    guard();
    return undefined;
  } catch (thrown) {
    expect(isRedirect(thrown)).toBe(true);
    return (thrown as { options: { to: string } }).options.to;
  }
}

describe("guards", () => {
  it("sends a signed-out visitor to sign in", () => {
    expect(redirectOf(() => requireSignedIn(null))).toBe("/signin");
  });

  it("lets a signed-in caller through, and returns who it is", () => {
    expect(requireSignedIn(member)).toBe(member);
  });

  it("sends a signed-in caller away from the sign-in page", () => {
    expect(redirectOf(() => requireSignedOut(member))).toBe("/");
    expect(redirectOf(() => requireSignedOut(null))).toBeUndefined();
  });

  it("sends a caller without the permission home", () => {
    expect(redirectOf(() => requirePermission(outsider, MEMBERS_READ))).toBe("/");
    expect(redirectOf(() => requirePermission(member, MEMBERS_READ))).toBeUndefined();
    expect(redirectOf(() => requirePermission(null, MEMBERS_READ))).toBe("/signin");
  });

  it("sends a caller without the permission to Home itself, never on to the start place", () => {
    try {
      requirePermission(outsider, MEMBERS_READ);
    } catch (thrown) {
      expect((thrown as { options: { search?: unknown } }).options.search).toEqual({ home: true });
    }
    expect.assertions(1);
  });
});
