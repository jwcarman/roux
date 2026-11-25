// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { createAuthClient, type AuthClient } from "./index";
import { at, server, setCsrfCookie } from "./testing";

beforeEach(() => setCsrfCookie("t"));

type Method = "get" | "post" | "put" | "patch" | "delete";

/** A call that needs a browser session on its own, and the request it sends first. */
type BrowserOnly = [name: string, call: (who: AuthClient<unknown>) => Promise<unknown>, method: Method, path: string];

const BROWSER_ONLY: BrowserOnly[] = [
  ["me.sessions.list", (who) => who.me.sessions.list(), "get", "/api/roux/auth/me/sessions"],
  ["me.sessions.end", (who) => who.me.sessions.end("s1"), "delete", "/api/roux/auth/me/sessions/s1"],
  ["me.sessions.endOthers", (who) => who.me.sessions.endOthers(), "delete", "/api/roux/auth/me/sessions"],
  ["me.passkeys.list", (who) => who.me.passkeys.list(), "get", "/api/roux/auth/me/passkeys"],
  ["me.passkeys.register", (who) => who.me.passkeys.register("Laptop"), "post", "/api/roux/auth/me/passkeys/options"],
  ["me.passkeys.remove", (who) => who.me.passkeys.remove("c1"), "delete", "/api/roux/auth/me/passkeys/c1"],
  [
    "me.emailAddresses.add",
    (who) => who.me.emailAddresses.add("a@example.com"),
    "post",
    "/api/roux/auth/me/email-addresses",
  ],
  [
    "me.emailAddresses.confirm",
    (who) => who.me.emailAddresses.confirm({ code: "123456" }),
    "post",
    "/api/roux/auth/me/email-addresses/confirmations",
  ],
  [
    "me.emailAddresses.remove",
    (who) => who.me.emailAddresses.remove("e1"),
    "delete",
    "/api/roux/auth/me/email-addresses/e1",
  ],
  ["me.accounts.link", (who) => who.me.accounts.link("github"), "post", "/api/roux/auth/me/accounts/github"],
  ["me.accounts.unlink", (who) => who.me.accounts.unlink("a1"), "delete", "/api/roux/auth/me/accounts/a1"],
  ["me.apiKeys.list", (who) => who.me.apiKeys.list(), "get", "/api/roux/auth/me/api-keys"],
  [
    "me.apiKeys.create",
    (who) => who.me.apiKeys.create({ name: "CI", lifetime: "P1D", scopes: ["x"] }),
    "post",
    "/api/roux/auth/me/api-keys",
  ],
  [
    "me.apiKeys.rotate",
    (who) => who.me.apiKeys.rotate("k1", "PT1H"),
    "post",
    "/api/roux/auth/me/api-keys/k1/rotations",
  ],
  ["me.apiKeys.revoke", (who) => who.me.apiKeys.revoke("k1"), "delete", "/api/roux/auth/me/api-keys/k1"],
];

const API_KEY_MANAGEMENT = BROWSER_ONLY.filter(([name]) => name.startsWith("me.apiKeys."));

function refused(code: string): HttpResponse<null> {
  return new HttpResponse(null, { status: 403, headers: { "Roux-Error": code } });
}

describe("a call that needs a browser session on its own", () => {
  it.each(BROWSER_ONLY)("%s answers browser-session-required", async (_name, call, method, path) => {
    server.use(http[method](at(path), () => refused("browser-session-required")));

    await expect(call(createAuthClient())).resolves.toMatchObject({
      ok: false,
      reason: "browser-session-required",
      status: 403,
    });
  });
});

describe("managing API keys with an API key", () => {
  it.each(API_KEY_MANAGEMENT)("%s answers api-key-cannot-manage-keys", async (_name, call, method, path) => {
    server.use(http[method](at(path), () => refused("api-key-cannot-manage-keys")));

    await expect(call(createAuthClient())).resolves.toMatchObject({
      ok: false,
      reason: "api-key-cannot-manage-keys",
      status: 403,
    });
  });
});
