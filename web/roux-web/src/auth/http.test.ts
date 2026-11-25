// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { AuthHttp, browserSessionRequired, nothing, type Call } from "./http";
import { createAuthClient } from "./index";
import { AuthError } from "./result";
import { at, clearCsrfCookie, server, setCsrfCookie } from "./testing";

/** A fetch that answers every request with the response given, and records what was asked. */
function answering(response: () => Response) {
  return vi.fn<typeof fetch>(() => Promise.resolve(response()));
}

/** A call that expects nothing back, and names any failed status `refused`. */
const CALL: Call<void, "refused"> = { method: "GET", path: "/thing", read: nothing, reason: () => "refused" };

describe("browserSessionRequired", () => {
  it("is a 403 naming browser-session-required, and nothing else", () => {
    expect(browserSessionRequired(403, "browser-session-required")).toBe("browser-session-required");
    expect(browserSessionRequired(401, "browser-session-required")).toBeUndefined();
    expect(browserSessionRequired(403, "something-else")).toBeUndefined();
  });
});

describe("AuthHttp", () => {
  it("asks for another origin's cookies only when the base is absolute", async () => {
    for (const [baseUrl, credentials] of [
      ["/api/roux/auth", "same-origin"],
      ["/proxy//api", "same-origin"], // two slashes inside a path are not a host
      ["//auth.example.test/api", "include"],
      ["https://auth.example.test/api", "include"],
      ["web3://auth.example.test/api", "include"], // a scheme may hold digits
    ] as const) {
      const fetch = answering(() => new Response(null, { status: 204 }));
      await new AuthHttp({ baseUrl, fetch }).refreshCsrf();
      expect(fetch.mock.calls[0][1], baseUrl).toEqual({ credentials });
    }
  });

  it("sends Accept and Content-Type only when there is something to say", async () => {
    setCsrfCookie("t");
    const fetch = answering(() => new Response(null, { status: 204 }));
    const client = new AuthHttp({ fetch });
    await client.call(CALL);
    await client.call({ ...CALL, method: "POST", body: { a: 1 }, accept: "application/json" });

    const [bare, full] = fetch.mock.calls.map(([, init]) => init);
    expect(bare?.headers).toStrictEqual({});
    expect(bare?.body).toBeUndefined();
    expect(full?.headers).toEqual({
      Accept: "application/json",
      "Content-Type": "application/json",
      "X-XSRF-TOKEN": "t",
    });
    expect(full?.body).toBe('{"a":1}');
  });

  it("names the call, and keeps the cause, when a success's body cannot be read", async () => {
    const broken = new Error("not JSON");
    const fetch = answering(() => new Response("{", { status: 200 }));
    const failure = new AuthHttp({ fetch }).call({ ...CALL, read: () => Promise.reject(broken) });

    await expect(failure).rejects.toThrow("the server answered GET /thing with a body it could not read");
    await expect(failure).rejects.toMatchObject({
      name: "AuthError",
      reason: "unexpected",
      status: 200,
      cause: broken,
    });
  });

  it("names the call and the status when the call does not expect it", async () => {
    const fetch = answering(() => new Response(null, { status: 418 }));
    const failure = new AuthHttp({ fetch }).call({ ...CALL, reason: () => undefined });

    await expect(failure).rejects.toThrow(new AuthError("the server answered GET /thing with 418", "unexpected", 418));
  });

  it("reads the code from the body only when it is a string in an object", async () => {
    for (const [body, code] of [
      [{ code: "from-the-body" }, "from-the-body"],
      [{ code: 7 }, null],
      [null, null],
      ["not an object", null],
    ] as const) {
      const reason = vi.fn<(status: number, code: string | null) => "refused">(() => "refused");
      const fetch = answering(() => Response.json(body, { status: 409 }));
      await new AuthHttp({ fetch }).call({ ...CALL, reason });
      expect(reason, JSON.stringify(body)).toHaveBeenCalledWith(409, code);
    }
  });

  it("gives no detail for an empty body or one that is not JSON", async () => {
    for (const text of ["", "<html>"]) {
      const fetch = answering(() => new Response(text, { status: 409 }));
      await expect(new AuthHttp({ fetch }).call(CALL)).resolves.toMatchObject({ ok: false, detail: undefined });
    }
  });
});

describe("the reasons a call names", () => {
  function refused(status: number, code: string): HttpResponse<null> {
    return new HttpResponse(null, { status, headers: { "Roux-Error": code } });
  }

  it("a key may not manage keys: a 403 naming api-key-cannot-manage-keys, and nothing else", async () => {
    const answers = [
      [403, "api-key-cannot-manage-keys", "api-key-cannot-manage-keys"],
      [403, "browser-session-required", "browser-session-required"],
    ] as const;
    for (const [status, code, reason] of answers) {
      server.use(http.get(at("/api/roux/auth/me/api-keys"), () => refused(status, code)));
      await expect(createAuthClient().me.apiKeys.list()).resolves.toMatchObject({ ok: false, reason });
    }
    for (const [status, code] of [
      [400, "api-key-cannot-manage-keys"],
      [403, "something-else"],
    ] as const) {
      server.use(http.get(at("/api/roux/auth/me/api-keys"), () => refused(status, code)));
      await expect(createAuthClient().me.apiKeys.list()).rejects.toMatchObject({ reason: "unexpected" });
    }
  });

  it("a failed human check is a 403 naming human-check-failed, and nothing else", async () => {
    setCsrfCookie("t");
    const signIn = () => createAuthClient().email.signIn({ email: "a@example.test", code: "123456" });
    server.use(http.post(at("/api/roux/auth/email/sign-in"), () => refused(403, "human-check-failed")));
    await expect(signIn()).resolves.toMatchObject({ ok: false, reason: "human-check-failed" });
    for (const [status, code] of [
      [403, "something-else"],
      [400, "human-check-failed"],
    ] as const) {
      server.use(http.post(at("/api/roux/auth/email/sign-in"), () => refused(status, code)));
      await expect(signIn()).rejects.toMatchObject({ reason: "unexpected" });
    }
  });
});

describe("the email link in the page's address", () => {
  it("leaves a fragment that holds no token as it is", async () => {
    history.replaceState(null, "", "/signin/link#other=1");

    await expect(createAuthClient().email.signInFromLocation()).resolves.toBeNull();
    expect(location.hash).toBe("#other=1");
  });
});

describe("clearCsrfCookie", () => {
  it("takes the CSRF cookie away", () => {
    setCsrfCookie("t");
    clearCsrfCookie();
    expect(document.cookie).not.toContain("XSRF-TOKEN");
  });
});
