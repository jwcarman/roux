// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

beforeEach(() => setCsrfCookie("t"));
afterEach(() => history.replaceState(null, "", "/"));

function refused(status: number, code?: string): HttpResponse<null> {
  return new HttpResponse(null, { status, headers: code ? { "Roux-Error": code } : {} });
}

describe("email.send", () => {
  it("asks for a link and code", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/email/send"), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );

    await expect(createAuthClient().email.send("alice@example.com")).resolves.toEqual({
      ok: true,
      value: undefined,
    });

    expect(body).toEqual({ email: "alice@example.com" });
  });

  it("throws on any refusal: the server answers every address the same", async () => {
    server.use(http.post(at("/api/roux/auth/email/send"), () => refused(403, "something")));

    await expect(createAuthClient().email.send("alice@example.com")).rejects.toMatchObject({ reason: "unexpected" });
  });
});

describe("email.signIn", () => {
  it.each([[{ token: "abc" }], [{ email: "alice@example.com", code: "123456" }]])(
    "signs in with %o",
    async (credentials) => {
      let body: unknown;
      server.use(
        http.post(at("/api/roux/auth/email/sign-in"), async ({ request }) => {
          body = await request.json();
          return HttpResponse.json({ identityId: "i1" });
        }),
      );

      await expect(createAuthClient().email.signIn(credentials)).resolves.toEqual({
        ok: true,
        value: { identityId: "i1" },
      });
      expect(body).toEqual(credentials);
    },
  );

  it("throws on another 403", async () => {
    server.use(http.post(at("/api/roux/auth/email/sign-in"), () => refused(403)));

    await expect(createAuthClient().email.signIn({ token: "abc" })).rejects.toThrow();
  });

  it("answers rejected on a 401", async () => {
    server.use(http.post(at("/api/roux/auth/email/sign-in"), () => refused(401, "sign-in-failed")));

    await expect(createAuthClient().email.signIn({ token: "bad" })).resolves.toMatchObject({
      ok: false,
      reason: "rejected",
    });
  });
});

describe("email.signInFromLocation", () => {
  it("answers null and sends nothing without a token", async () => {
    history.replaceState(null, "", "/signin#other=1");

    await expect(createAuthClient().email.signInFromLocation()).resolves.toBeNull();
  });

  it("takes the token out of the address bar before signing in, keeping the path and query", async () => {
    history.replaceState(null, "", "/signin?next=%2Fboard#token=abc&x=1");
    const replace = vi.spyOn(history, "replaceState");
    let urlAtRequest = "";
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/email/sign-in"), async ({ request }) => {
        urlAtRequest = location.href;
        body = await request.json();
        return HttpResponse.json({ identityId: "i1" });
      }),
    );

    await expect(createAuthClient().email.signInFromLocation()).resolves.toMatchObject({ ok: true });

    expect(replace).toHaveBeenCalledWith(null, "", "/signin?next=%2Fboard");
    expect(urlAtRequest).toBe(at("/signin?next=%2Fboard"));
    expect(body).toEqual({ token: "abc" });
  });

  it("takes the token out even when the sign-in fails", async () => {
    history.replaceState(null, "", "/signin#token=bad");
    server.use(http.post(at("/api/roux/auth/email/sign-in"), () => refused(401)));

    await createAuthClient().email.signInFromLocation();

    expect(location.hash).toBe("");
  });
});

describe("me.emailAddresses.add", () => {
  it("adds an address", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/email-addresses"), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );

    await expect(createAuthClient().me.emailAddresses.add("bob@example.com")).resolves.toEqual({
      ok: true,
      value: undefined,
    });
    expect(body).toEqual({ address: "bob@example.com" });
  });

  it("replaces an address", async () => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/email-addresses"), async ({ request }) => {
        body = await request.json();
        return new HttpResponse(null, { status: 202 });
      }),
    );

    await createAuthClient().me.emailAddresses.add("bob@example.com", "id1");

    expect(body).toEqual({ address: "bob@example.com", replaces: "id1" });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
    [404, "email-address-not-found", "not-found"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/me/email-addresses"), () => refused(status, code)));

    await expect(createAuthClient().me.emailAddresses.add("bob@example.com", "id1")).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });
});

describe("me.emailAddresses.confirm", () => {
  it.each([[{ token: "abc" }], [{ code: "123456" }]])("confirms with %o", async (proof) => {
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/email-addresses/confirmations"), async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ credentialId: "c1" });
      }),
    );

    await expect(createAuthClient().me.emailAddresses.confirm(proof)).resolves.toEqual({
      ok: true,
      value: { credentialId: "c1" },
    });
    expect(body).toEqual(proof);
  });

  it.each([
    [400, "invalid-confirmation", "rejected"],
    [409, "email-address-taken", "conflict"],
    [401, "reauthentication-required", "reauthentication-required"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.post(at("/api/roux/auth/me/email-addresses/confirmations"), () => refused(status, code)));

    await expect(createAuthClient().me.emailAddresses.confirm({ code: "000000" })).resolves.toMatchObject({
      ok: false,
      reason,
    });
  });
});

describe("me.emailAddresses.confirmFromLocation", () => {
  it("answers null without a confirm-address token", async () => {
    history.replaceState(null, "", "/profile");

    await expect(createAuthClient().me.emailAddresses.confirmFromLocation()).resolves.toBeNull();
  });

  it("takes the token out of the address bar before confirming", async () => {
    history.replaceState(null, "", "/profile?tab=email#confirm-address=abc");
    let urlAtRequest = "";
    let body: unknown;
    server.use(
      http.post(at("/api/roux/auth/me/email-addresses/confirmations"), async ({ request }) => {
        urlAtRequest = location.href;
        body = await request.json();
        return HttpResponse.json({ credentialId: "c1" });
      }),
    );

    await expect(createAuthClient().me.emailAddresses.confirmFromLocation()).resolves.toEqual({
      ok: true,
      value: { credentialId: "c1" },
    });

    expect(urlAtRequest).toBe(at("/profile?tab=email"));
    expect(body).toEqual({ token: "abc" });
  });
});

describe("me.emailAddresses.list", () => {
  it("answers the addresses", async () => {
    const address = { id: "e1", address: "bob@example.com", createdAt: "2026-11-16T10:00:00Z" };
    server.use(http.get(at("/api/roux/auth/me/email-addresses"), () => HttpResponse.json([address])));

    await expect(createAuthClient().me.emailAddresses.list()).resolves.toEqual({ ok: true, value: [address] });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me/email-addresses"), () => refused(401, "not-signed-in")));

    await expect(createAuthClient().me.emailAddresses.list()).resolves.toMatchObject({
      ok: false,
      reason: "signed-out",
    });
  });
});

describe("me.emailAddresses.remove", () => {
  it("removes by the escaped id", async () => {
    server.use(
      http.delete(at("/api/roux/auth/me/email-addresses/a%2Fb"), () => new HttpResponse(null, { status: 204 })),
    );

    await expect(createAuthClient().me.emailAddresses.remove("a/b")).resolves.toEqual({ ok: true, value: undefined });
  });

  it.each([
    [401, "reauthentication-required", "reauthentication-required"],
    [401, "not-signed-in", "signed-out"],
    [404, "email-address-not-found", "not-found"],
    [409, "last-credential", "last-credential"],
  ])("answers %i %s as %s", async (status, code, reason) => {
    server.use(http.delete(at("/api/roux/auth/me/email-addresses/e1"), () => refused(status, code)));

    await expect(createAuthClient().me.emailAddresses.remove("e1")).resolves.toMatchObject({
      ok: false,
      reason,
      status,
    });
  });

  it("throws on a 409 that does not say last-credential", async () => {
    server.use(http.delete(at("/api/roux/auth/me/email-addresses/e1"), () => refused(409)));

    await expect(createAuthClient().me.emailAddresses.remove("e1")).rejects.toMatchObject({
      reason: "unexpected",
      status: 409,
    });
  });
});
