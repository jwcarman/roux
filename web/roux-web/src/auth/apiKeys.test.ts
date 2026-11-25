// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

const LISTED = {
  id: "k1",
  name: "CI",
  scopes: ["read"],
  createdAt: "2026-11-16T10:00:00Z",
  expiresAt: "2026-12-16T10:00:00Z",
  lastUsedAt: null,
};

const CREATED = { id: "k1", name: "CI", scopes: ["read"], expiresAt: "2026-12-16T10:00:00Z", key: "who_secret" };

beforeEach(() => setCsrfCookie("t"));

function refused(status: number, code?: string): HttpResponse<null> {
  return new HttpResponse(null, { status, headers: code ? { "Roux-Error": code } : {} });
}

describe("me.apiKeys.list", () => {
  it("answers the keys", async () => {
    server.use(http.get(at("/api/roux/auth/me/api-keys"), () => HttpResponse.json([LISTED])));

    await expect(createAuthClient().me.apiKeys.list()).resolves.toEqual({ ok: true, value: [LISTED] });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me/api-keys"), () => refused(401, "not-signed-in")));

    await expect(createAuthClient().me.apiKeys.list()).resolves.toMatchObject({ ok: false, reason: "signed-out" });
  });
});

describe("me.apiKeys.create", () => {
  it("makes a key and answers it with its secret", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/api-keys"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    await expect(
      createAuthClient().me.apiKeys.create({ name: "CI", lifetime: "P30D", scopes: ["read"] }),
    ).resolves.toEqual({ ok: true, value: CREATED });
    expect(body).toEqual({ name: "CI", lifetime: "P30D", scopes: ["read"] });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
    [400, "invalid-request", "invalid-request"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/me/api-keys"), () => refused(status, code)));

    await expect(
      createAuthClient().me.apiKeys.create({ name: "CI", lifetime: "P30D", scopes: [] }),
    ).resolves.toMatchObject({ ok: false, reason, status });
  });
});

describe("me.apiKeys.rotate", () => {
  it("rotates the escaped id with the overlap", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/api-keys/a%2Fb/rotations"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json(CREATED, { status: 201 });
      }),
    );

    await expect(createAuthClient().me.apiKeys.rotate("a/b", "PT1H")).resolves.toEqual({ ok: true, value: CREATED });
    expect(body).toEqual({ overlap: "PT1H" });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [404, "api-key-not-found", "not-found"],
    [400, "invalid-request", "invalid-request"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/me/api-keys/k1/rotations"), () => refused(status, code)));

    await expect(createAuthClient().me.apiKeys.rotate("k1", "PT1H")).resolves.toMatchObject({
      ok: false,
      reason,
      status,
    });
  });
});

describe("me.apiKeys.revoke", () => {
  it("revokes by the escaped id", async () => {
    server.use(http.delete(at("/api/roux/auth/me/api-keys/a%2Fb"), () => new HttpResponse(null, { status: 204 })));

    await expect(createAuthClient().me.apiKeys.revoke("a/b")).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    [401, "not-signed-in", "signed-out"],
    [404, "api-key-not-found", "not-found"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.delete(at("/api/roux/auth/me/api-keys/k1"), () => refused(status, code)));

    await expect(createAuthClient().me.apiKeys.revoke("k1")).resolves.toMatchObject({ ok: false, reason, status });
  });
});

describe("me.apiKeys.current", () => {
  it("answers the key this request used", async () => {
    server.use(http.get(at("/api/roux/auth/me/api-keys/current"), () => HttpResponse.json(LISTED)));

    await expect(createAuthClient().me.apiKeys.current()).resolves.toEqual({ ok: true, value: LISTED });
  });

  it.each([
    [401, "not-signed-in", "signed-out"],
    [404, "api-key-not-found", "not-found"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.get(at("/api/roux/auth/me/api-keys/current"), () => refused(status, code)));

    await expect(createAuthClient().me.apiKeys.current()).resolves.toMatchObject({ ok: false, reason, status });
  });
});
