// @vitest-environment jsdom
import { isRedirect } from "@tanstack/react-router";
import { afterEach, describe, expect, it } from "vitest";
import type { Me } from "../api";
import { MEMBERS_READ } from "../api";
import { requirePermission, requireSignedIn, requireSignedOut } from "./guards";
import { takeReturn } from "./returnTo";

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
  afterEach(() => {
    localStorage.clear();
  });

  it("sends a signed-out visitor to sign in", () => {
    expect(redirectOf(() => requireSignedIn(null))).toBe("/signin");
  });

  it("remembers the page a signed-out visitor asked for, so signing in can go back to it", () => {
    expect(redirectOf(() => requireSignedIn(null, "/classes/c1/check-in?date=2026-03-10"))).toBe("/signin");

    expect(takeReturn()).toBe("/classes/c1/check-in?date=2026-03-10");
  });

  it("remembers nothing for a caller who is signed in", () => {
    requireSignedIn(member, "/students");

    expect(takeReturn()).toBeUndefined();
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
