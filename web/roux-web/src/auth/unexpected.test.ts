// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { type AuthClient, createAuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

beforeEach(() => setCsrfCookie("t"));

afterEach(() => vi.unstubAllGlobals());

// A status a call has no answer for is a fault, thrown, not a reason the caller handles.
describe("a call the server answers with a status it does not expect", () => {
  it.each<[string, "get" | "post" | "delete", string, (auth: AuthClient<unknown>) => Promise<unknown>]>([
    ["signOut", "post", "/api/roux/auth/logout", (auth) => auth.signOut()],
    [
      "me.apiKeys.create",
      "post",
      "/api/roux/auth/me/api-keys",
      (auth) => auth.me.apiKeys.create({ name: "CI", lifetime: "P1D", scopes: [] }),
    ],
    [
      "me.emailAddresses.add",
      "post",
      "/api/roux/auth/me/email-addresses",
      (auth) => auth.me.emailAddresses.add("a@b.c"),
    ],
    [
      "me.emailAddresses.confirm",
      "post",
      "/api/roux/auth/me/email-addresses/confirmations",
      (auth) => auth.me.emailAddresses.confirm({ code: "123456" }),
    ],
    ["oidc.pending", "get", "/api/roux/auth/oidc/pending", (auth) => auth.oidc.pending()],
    ["me.accounts.link", "post", "/api/roux/auth/me/accounts/google", (auth) => auth.me.accounts.link("google")],
  ])("%s throws", async (_, method, path, call) => {
    server.use(http[method](at(path), () => new HttpResponse(null, { status: 500 })));

    await expect(call(createAuthClient())).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });
});

describe("the default navigation", () => {
  it("sends the page to the provider with location.assign", async () => {
    const assign = vi.fn<(url: string) => void>();
    const real = window.location;
    vi.stubGlobal("location", { assign, href: real.href, origin: real.origin, toString: () => real.href });
    server.use(
      http.post(at("/api/roux/auth/me/accounts/google"), () =>
        HttpResponse.json({ redirectUrl: "https://provider.example/authorize" }),
      ),
    );

    void createAuthClient().me.accounts.link("google");

    await vi.waitFor(() => expect(assign).toHaveBeenCalledWith("https://provider.example/authorize"));
  });
});
