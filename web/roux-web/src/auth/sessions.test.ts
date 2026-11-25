// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

const SESSION = {
  id: "s1",
  device: "Firefox on macOS",
  userAgent: null,
  signInMethod: "passkey",
  signedInAt: "2026-11-16T10:00:00Z",
  lastSeenAt: "2026-11-16T10:05:00Z",
  current: true,
};

beforeEach(() => setCsrfCookie("t"));

function refused(status: number, code?: string): HttpResponse<null> {
  return new HttpResponse(null, { status, headers: code ? { "Roux-Error": code } : {} });
}

describe("me.sessions.list", () => {
  it("answers the sessions", async () => {
    server.use(http.get(at("/api/roux/auth/me/sessions"), () => HttpResponse.json([SESSION])));

    await expect(createAuthClient().me.sessions.list()).resolves.toEqual({ ok: true, value: [SESSION] });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me/sessions"), () => refused(401, "not-signed-in")));

    await expect(createAuthClient().me.sessions.list()).resolves.toMatchObject({ ok: false, reason: "signed-out" });
  });
});

describe("me.sessions.end", () => {
  it.each([
    ["reauthentication-required", "reauthentication-required"],
    ["not-signed-in", "signed-out"],
    [undefined, "sign-in-required"],
  ])("tells a 401 with Roux-Error %s apart: %s", async (code, reason) => {
    server.use(http.delete(at("/api/roux/auth/me/sessions/s1"), () => refused(401, code)));

    await expect(createAuthClient().me.sessions.end("s1")).resolves.toMatchObject({ ok: false, reason, status: 401 });
  });

  it("answers not-found on a 404", async () => {
    server.use(http.delete(at("/api/roux/auth/me/sessions/s1"), () => refused(404)));

    await expect(createAuthClient().me.sessions.end("s1")).resolves.toMatchObject({ ok: false, reason: "not-found" });
  });

  it("escapes the id", async () => {
    server.use(http.delete(at("/api/roux/auth/me/sessions/a%2Fb"), () => new HttpResponse(null, { status: 204 })));

    await expect(createAuthClient().me.sessions.end("a/b")).resolves.toEqual({ ok: true, value: undefined });
  });

  it("throws on a 500", async () => {
    server.use(http.delete(at("/api/roux/auth/me/sessions/s1"), () => refused(500)));

    await expect(createAuthClient().me.sessions.end("s1")).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });
});

describe("me.sessions.endOthers", () => {
  it("ends every other session", async () => {
    server.use(
      http.delete(at("/api/roux/auth/me/sessions"), ({ request }) =>
        new URL(request.url).searchParams.get("others") === "true" ? HttpResponse.json({ ended: 2 }) : refused(400),
      ),
    );

    await expect(createAuthClient().me.sessions.endOthers()).resolves.toEqual({ ok: true, value: { ended: 2 } });
  });

  it("needs a recent sign-in", async () => {
    server.use(http.delete(at("/api/roux/auth/me/sessions"), () => refused(401, "reauthentication-required")));

    await expect(createAuthClient().me.sessions.endOthers()).resolves.toMatchObject({
      ok: false,
      reason: "reauthentication-required",
    });
  });
});
