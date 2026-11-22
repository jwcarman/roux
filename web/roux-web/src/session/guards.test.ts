// @vitest-environment jsdom
import { isRedirect } from "@tanstack/react-router";
import { describe, expect, it } from "vitest";
import { requirePermission, requireSignedIn, requireSignedOut } from "./guards";

const USERS_READ = "users.read";

const user = { identityId: "ada", permissions: [USERS_READ] };
const outsider = { identityId: "eve", permissions: [] };

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
    expect(requireSignedIn(user)).toBe(user);
  });

  it("sends a signed-in caller away from the sign-in page", () => {
    expect(redirectOf(() => requireSignedOut(user))).toBe("/");
    expect(redirectOf(() => requireSignedOut(null))).toBeUndefined();
  });

  it("sends a caller without the permission home", () => {
    expect(redirectOf(() => requirePermission(outsider, USERS_READ))).toBe("/");
    expect(redirectOf(() => requirePermission(user, USERS_READ))).toBeUndefined();
  });

  it("sends a caller without the permission to Home itself, never on to the start place", () => {
    try {
      requirePermission(outsider, USERS_READ);
    } catch (thrown) {
      expect((thrown as { options: { state?: unknown } }).options.state).toEqual({ home: true });
    }
    expect.assertions(1);
  });
});
