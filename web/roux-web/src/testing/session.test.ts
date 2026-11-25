// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { getJson } from "../api/client";
import { server } from "./server";
import { signedInAs, TEST_USER } from "./session";

describe("signedInAs", () => {
  it("answers the session's two requests for someone signed in with the permissions", async () => {
    server.use(...signedInAs(["items.read"]));
    await expect(getJson("roux/auth/me")).resolves.toEqual({
      identityId: TEST_USER.id,
      permissions: ["items.read"],
    });
    await expect(getJson("roux/users/me")).resolves.toEqual(TEST_USER);
    expect(TEST_USER).toEqual({
      id: "id-1",
      displayName: "Test User",
      email: "test@example.org",
      version: 0,
    });
  });

  it("answers both 401 for nobody signed in", async () => {
    server.use(...signedInAs(null));
    await expect(getJson("roux/auth/me")).rejects.toMatchObject({ status: 401 });
    await expect(getJson("roux/users/me")).rejects.toMatchObject({ status: 401 });
  });
});
