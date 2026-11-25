// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { createAuthClient, AuthError } from "./index";
import { at, server, setCsrfCookie } from "./testing";

/** A fetch that records each request's init, then lets it through to the fake server. */
function recordingFetch(): { fetch: typeof fetch; calls: [string, RequestInit | undefined][] } {
  const calls: [string, RequestInit | undefined][] = [];
  return {
    calls,
    fetch: (input, init) => {
      calls.push([typeof input === "string" ? input : input instanceof URL ? input.href : input.url, init]);
      return fetch(input, init);
    },
  };
}

describe("createAuthClient", () => {
  it("defaults to /who", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => HttpResponse.json({ identityId: "i", permissions: [] })));

    await expect(createAuthClient().me.get()).resolves.toMatchObject({ ok: true });
  });

  it("drops a trailing slash from baseUrl", async () => {
    server.use(http.get(at("/auth/me"), () => HttpResponse.json({ identityId: "i", permissions: [] })));

    await expect(createAuthClient({ baseUrl: "/auth/" }).me.get()).resolves.toMatchObject({ ok: true });
  });

  it.each(["/api/roux/auth?x=1", "/who#x"])("refuses a baseUrl with a query or fragment: %s", (baseUrl) => {
    expect(() => createAuthClient({ baseUrl })).toThrow(/baseUrl/);
  });

  it("sends cookies same-origin for a relative baseUrl", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => HttpResponse.json({ identityId: "i", permissions: [] })));
    const recording = recordingFetch();

    await createAuthClient({ fetch: recording.fetch }).me.get();

    expect(recording.calls[0]?.[1]?.credentials).toBe("same-origin");
  });

  it("sends cookies to an absolute baseUrl", async () => {
    server.use(
      http.get("https://auth.example.com/who/me", () => HttpResponse.json({ identityId: "i", permissions: [] })),
    );
    const recording = recordingFetch();

    await createAuthClient({ baseUrl: "https://auth.example.com/who", fetch: recording.fetch }).me.get();

    expect(recording.calls[0]?.[0]).toBe("https://auth.example.com/who/me");
    expect(recording.calls[0]?.[1]?.credentials).toBe("include");
  });
});

describe("CSRF", () => {
  it("fetches the cookie before the first unsafe request, then echoes it decoded", async () => {
    const order: string[] = [];
    server.use(
      http.get(at("/api/roux/auth/me"), () => {
        order.push("GET /who/me");
        setCsrfCookie("a%2Fb");
        return new HttpResponse(null, { status: 401 });
      }),
      http.delete(at("/api/roux/auth/me/sessions/a"), ({ request }) => {
        order.push(`DELETE /who/me/sessions/a ${request.headers.get("X-XSRF-TOKEN")}`);
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await expect(createAuthClient().me.sessions.end("a")).resolves.toEqual({ ok: true, value: undefined });

    expect(order).toEqual(["GET /who/me", "DELETE /who/me/sessions/a a/b"]);
  });

  it("reads the cookie fresh on every request", async () => {
    const tokens: (string | null)[] = [];
    server.use(
      http.delete(at("/api/roux/auth/me/sessions/a"), ({ request }) => {
        tokens.push(request.headers.get("X-XSRF-TOKEN"));
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const who = createAuthClient();

    setCsrfCookie("one");
    await who.me.sessions.end("a");
    setCsrfCookie("two");
    await who.me.sessions.end("a");

    expect(tokens).toEqual(["one", "two"]);
  });

  it("sends no CSRF header on a GET", async () => {
    setCsrfCookie("t");
    let header: string | null = "unset";
    server.use(
      http.get(at("/api/roux/auth/me"), ({ request }) => {
        header = request.headers.get("X-XSRF-TOKEN");
        return HttpResponse.json({ identityId: "i", permissions: [] });
      }),
    );

    await createAuthClient().me.get();

    expect(header).toBeNull();
  });
});

describe("me.get", () => {
  it("answers the signed-in identity", async () => {
    const me = {
      identityId: "i1",
      permissions: ["read"],
      signInMethod: "email-link",
      recentSignInUntil: "2026-11-16T10:05:00Z",
      credentials: { email: 1, passkey: 2, account: 0 },
    };
    server.use(http.get(at("/api/roux/auth/me"), () => HttpResponse.json(me)));

    await expect(createAuthClient().me.get()).resolves.toEqual({ ok: true, value: me });
  });

  it("answers signed-out on a 401", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => new HttpResponse(null, { status: 401 })));

    await expect(createAuthClient().me.get()).resolves.toEqual({
      ok: false,
      reason: "signed-out",
      status: 401,
      detail: undefined,
    });
  });

  it("throws on a status it does not expect", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => new HttpResponse(null, { status: 500 })));

    const failure = createAuthClient().me.get();

    await expect(failure).rejects.toBeInstanceOf(AuthError);
    await expect(failure).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });

  it("throws on a success body that is not JSON", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => new HttpResponse("nope", { status: 200 })));

    await expect(createAuthClient().me.get()).rejects.toMatchObject({ reason: "unexpected", status: 200 });
  });

  it("lets a network failure through as it is", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => HttpResponse.error()));

    await expect(createAuthClient().me.get()).rejects.toBeInstanceOf(TypeError);
  });
});

describe("signInOptions", () => {
  it("answers the ways of signing in", async () => {
    const options = { email: true, passkey: false, providers: [{ id: "github", name: "GitHub" }] };
    server.use(http.get(at("/api/roux/auth/sign-in"), () => HttpResponse.json(options)));

    await expect(createAuthClient().signInOptions()).resolves.toEqual({ ok: true, value: options });
  });

  it("throws on a status it does not expect", async () => {
    server.use(http.get(at("/api/roux/auth/sign-in"), () => new HttpResponse(null, { status: 500 })));

    await expect(createAuthClient().signInOptions()).rejects.toMatchObject({ reason: "unexpected", status: 500 });
  });
});

describe("decodeError", () => {
  it("by default parses a JSON error body", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => HttpResponse.json({ title: "Sign in first" }, { status: 401 })));

    await expect(createAuthClient().me.get()).resolves.toMatchObject({ detail: { title: "Sign in first" } });
  });

  it("by default gives undefined for a body that is not JSON", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => new HttpResponse("<html>", { status: 401 })));

    await expect(createAuthClient().me.get()).resolves.toMatchObject({ detail: undefined });
  });

  it("puts the application's decoding in detail", async () => {
    server.use(
      http.get(at("/api/roux/auth/me"), () => HttpResponse.json({ detail: "Sign in first" }, { status: 401 })),
    );
    const who = createAuthClient({
      decodeError: async (response) => ((await response.json()) as { detail: string }).detail,
    });

    const result = await who.me.get();

    expect(result.ok ? undefined : result.detail).toBe("Sign in first");
  });

  it("lets the decoder's own failure through", async () => {
    server.use(http.get(at("/api/roux/auth/me"), () => new HttpResponse(null, { status: 401 })));
    const broken = new Error("decoder broke");
    const who = createAuthClient({ decodeError: () => Promise.reject(broken) });

    await expect(who.me.get()).rejects.toBe(broken);
  });
});

describe("the error code", () => {
  const problem = (code: string, status: number) =>
    HttpResponse.json(
      { type: `urn:roux:error:${code}`, title: "Unauthorized", status, detail: "Sign in again", code },
      { status, headers: { "Content-Type": "application/problem+json" } },
    );

  it("comes from the body's code when the header cannot be read", async () => {
    server.use(http.delete(at("/api/roux/auth/me/sessions/a"), () => problem("reauthentication-required", 401)));
    setCsrfCookie("t");

    await expect(createAuthClient().me.sessions.end("a")).resolves.toMatchObject({
      ok: false,
      reason: "reauthentication-required",
      detail: { code: "reauthentication-required" },
    });
  });

  it("comes from the header first", async () => {
    server.use(
      http.delete(
        at("/api/roux/auth/me/sessions/a"),
        () =>
          new HttpResponse(JSON.stringify({ code: "reauthentication-required" }), {
            status: 401,
            headers: { "Roux-Error": "not-signed-in", "Content-Type": "application/json" },
          }),
      ),
    );
    setCsrfCookie("t");

    await expect(createAuthClient().me.sessions.end("a")).resolves.toMatchObject({ reason: "signed-out" });
  });
});

describe("signOut", () => {
  it("signs out, then fetches a new CSRF cookie", async () => {
    setCsrfCookie("t");
    const order: string[] = [];
    server.use(
      http.post(at("/api/roux/auth/logout"), () => {
        order.push("POST /who/logout");
        return new HttpResponse(null, { status: 204 });
      }),
      http.get(at("/api/roux/auth/me"), () => {
        order.push("GET /who/me");
        return new HttpResponse(null, { status: 401 });
      }),
    );

    await createAuthClient().signOut();

    expect(order).toEqual(["POST /who/logout", "GET /who/me"]);
  });

  it("uses the fetch it was given for every request", async () => {
    setCsrfCookie("t");
    server.use(
      http.post(at("/api/roux/auth/logout"), () => new HttpResponse(null, { status: 204 })),
      http.get(at("/api/roux/auth/me"), () => new HttpResponse(null, { status: 401 })),
    );
    const spy = vi.fn(fetch);

    await createAuthClient({ fetch: spy }).signOut();

    expect(spy).toHaveBeenCalledTimes(2);
  });
});
