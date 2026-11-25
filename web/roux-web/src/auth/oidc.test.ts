// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

beforeEach(() => setCsrfCookie("t"));

function refused(status: number, code?: string): HttpResponse<null> {
  return new HttpResponse(null, { status, headers: code ? { "Roux-Error": code } : {} });
}

describe("oidc.authorizeUrl", () => {
  it("is the provider's authorize path below the base, escaped", () => {
    expect(createAuthClient({ baseUrl: "/auth" }).oidc.authorizeUrl("a b")).toBe("/auth/oidc/authorize/a%20b");
  });

  it("keeps an absolute base", () => {
    expect(createAuthClient({ baseUrl: "https://auth.example.com/who" }).oidc.authorizeUrl("google")).toBe(
      "https://auth.example.com/who/oidc/authorize/google",
    );
  });
});

describe("oidc.pending", () => {
  it("describes the pending provider account", async () => {
    const pending = { provider: "google", displayName: "Alice", canSignUp: true, canLink: false };
    server.use(http.get(at("/api/roux/auth/oidc/pending"), () => HttpResponse.json(pending)));

    await expect(createAuthClient().oidc.pending()).resolves.toEqual({ ok: true, value: pending });
  });

  it("answers none-pending on a 404", async () => {
    server.use(http.get(at("/api/roux/auth/oidc/pending"), () => refused(404, "no-pending-sign-up")));

    await expect(createAuthClient().oidc.pending()).resolves.toMatchObject({ ok: false, reason: "none-pending" });
  });
});

describe("oidc.signUp", () => {
  it("signs up", async () => {
    server.use(http.post(at("/api/roux/auth/oidc/pending/sign-up"), () => HttpResponse.json({ identityId: "i1" })));

    await expect(createAuthClient().oidc.signUp()).resolves.toEqual({ ok: true, value: { identityId: "i1" } });
  });

  it.each([
    [403, "sign-up-refused", "refused"],
    [404, "no-pending-sign-up", "none-pending"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/oidc/pending/sign-up"), () => refused(status, code)));

    await expect(createAuthClient().oidc.signUp()).resolves.toMatchObject({ ok: false, reason });
  });
});

describe("oidc.link", () => {
  it("links the pending account", async () => {
    server.use(http.post(at("/api/roux/auth/oidc/pending/link"), () => HttpResponse.json({ credentialId: "c1" })));

    await expect(createAuthClient().oidc.link()).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    [409, "already-linked", "conflict"],
    [404, "no-pending-sign-up", "none-pending"],
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/oidc/pending/link"), () => refused(status, code)));

    await expect(createAuthClient().oidc.link()).resolves.toMatchObject({ ok: false, reason });
  });
});

describe("me.accounts.link", () => {
  it("asks for JSON, then sends the page to the provider and never settles", async () => {
    let accept: string | null = null;
    server.use(
      http.post(at("/api/roux/auth/me/accounts/a%20b"), ({ request }) => {
        accept = request.headers.get("Accept");
        return HttpResponse.json({ redirectUrl: "https://provider.example/authorize?x=1" });
      }),
    );
    const assign = vi.fn<(url: string) => void>();
    const who = createAuthClient({ navigate: assign });

    let settled = false;
    void who.me.accounts.link("a b").finally(() => {
      settled = true;
    });
    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://provider.example/authorize?x=1"));
    await new Promise((resolve) => setTimeout(resolve, 20));

    expect(accept).toBe("application/json");
    expect(settled).toBe(false);
  });

  it.each([
    [404, "unknown-provider", "not-found"],
    [401, "reauthentication-required", "reauthentication-required"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/me/accounts/google"), () => refused(status, code)));

    await expect(createAuthClient().me.accounts.link("google")).resolves.toMatchObject({ ok: false, reason });
  });
});

describe("me.accounts.list", () => {
  it("answers the linked accounts", async () => {
    const account = { id: "a1", provider: "github", linkedAt: "2026-11-16T10:00:00Z" };
    server.use(http.get(at("/api/roux/auth/me/accounts"), () => HttpResponse.json([account])));

    await expect(createAuthClient().me.accounts.list()).resolves.toEqual({ ok: true, value: [account] });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me/accounts"), () => refused(401, "not-signed-in")));

    await expect(createAuthClient().me.accounts.list()).resolves.toMatchObject({ ok: false, reason: "signed-out" });
  });
});

describe("me.accounts.unlink", () => {
  it("unlinks by the escaped id", async () => {
    server.use(http.delete(at("/api/roux/auth/me/accounts/a%2Fb"), () => new HttpResponse(null, { status: 204 })));

    await expect(createAuthClient().me.accounts.unlink("a/b")).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
    [404, "linked-account-not-found", "not-found"],
    [409, "last-credential", "last-credential"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.delete(at("/api/roux/auth/me/accounts/a1"), () => refused(status, code)));

    await expect(createAuthClient().me.accounts.unlink("a1")).resolves.toMatchObject({ ok: false, reason, status });
  });

  it("throws on a 409 that does not say last-credential", async () => {
    server.use(http.delete(at("/api/roux/auth/me/accounts/a1"), () => refused(409)));

    await expect(createAuthClient().me.accounts.unlink("a1")).rejects.toMatchObject({
      reason: "unexpected",
      status: 409,
    });
  });
});
