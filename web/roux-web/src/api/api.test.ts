// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, getJson, isSessionLost, onSessionLost, send } from "./client";
import { server } from "../testing/server";

/** Every request, whatever its method or path, answers `status`. */
function respond(status: number) {
  server.use(http.all("*", () => HttpResponse.json({}, { status })));
}

describe("api", () => {
  let lost: ReturnType<typeof vi.fn<() => void>>;
  let unsubscribe: () => void;

  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=a%2Bb";
    lost = vi.fn<() => void>();
    unsubscribe = onSessionLost(lost);
  });

  afterEach(() => {
    unsubscribe();
  });

  it("reports a 401 from the API as a lost session, then rejects", async () => {
    respond(401);

    const error = await getJson("/api/passkeys").catch((e: unknown) => e);

    expect(lost).toHaveBeenCalledOnce();
    expect(error).toBeInstanceOf(ApiError);
    expect(isSessionLost(error)).toBe(true);
  });

  it("rejects with the problem the server answered", async () => {
    server.use(
      http.get("/api/members/x", () =>
        HttpResponse.json(
          { title: "Not Found", status: 404, detail: "No such member" },
          { status: 404, headers: { "Content-Type": "application/problem+json" } },
        ),
      ),
    );

    const error = await getJson("/api/members/x").catch((e: unknown) => e);

    expect(error).toBeInstanceOf(ApiError);
    expect((error as ApiError).problem.detail).toBe("No such member");
  });

  it("reports a 401 from an API write as a lost session", async () => {
    respond(401);

    const response = await send("POST", "/api/members/invitations", { email: "a@b.c" });

    expect(response.status).toBe(401);
    expect(lost).toHaveBeenCalledOnce();
  });

  it("does not report a signed-out /who/me, which is how the session is checked", async () => {
    respond(401);

    await send("POST", "/who/me");

    expect(lost).not.toHaveBeenCalled();
  });

  it("does not report other failures", async () => {
    respond(403);

    const error = await getJson("/api/passkeys").catch((e: unknown) => e);

    expect(lost).not.toHaveBeenCalled();
    expect(isSessionLost(error)).toBe(false);
  });

  it("sends the CSRF cookie's value URL-decoded", async () => {
    let token: string | null = null;
    server.use(
      http.delete("/api/thing", ({ request }) => {
        token = request.headers.get("X-XSRF-TOKEN");
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await send("DELETE", "/api/thing");

    expect(token).toBe("a+b");
  });

  it("answers the body of a successful read", async () => {
    server.use(http.get("/api/things", () => HttpResponse.json([{ id: "1" }])));

    await expect(getJson("/api/things")).resolves.toEqual([{ id: "1" }]);
  });

  it("stops calling a listener once it unsubscribes", async () => {
    respond(401);
    unsubscribe();

    await getJson("/api/passkeys").catch(() => undefined);

    expect(lost).not.toHaveBeenCalled();
  });

  it("asks for JSON on a read, with the session's cookies", async () => {
    let accept: string | null = null;
    server.use(
      http.get("/api/things", ({ request }) => {
        accept = request.headers.get("Accept");
        return HttpResponse.json([]);
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await getJson("/api/things");

    expect(accept).toBe("application/json");
    expect(fetchSpy).toHaveBeenCalledWith("/api/things", expect.objectContaining({ credentials: "same-origin" }));
    fetchSpy.mockRestore();
  });

  it("sends a body as JSON", async () => {
    let request: Request | undefined;
    server.use(
      http.put("/api/thing", ({ request: sent }) => {
        request = sent.clone();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await send("PUT", "/api/thing", { name: "Ada" });

    expect(request?.headers.get("Accept")).toBe("application/json");
    expect(request?.headers.get("Content-Type")).toBe("application/json");
    expect(request?.credentials).toBe("same-origin");
    await expect(request?.text()).resolves.toBe('{"name":"Ada"}');
  });

  it("sends no body and no content type without one", async () => {
    let request: Request | undefined;
    server.use(
      http.post("/api/thing", ({ request: sent }) => {
        request = sent.clone();
        return new HttpResponse(null, { status: 204 });
      }),
    );

    await send("POST", "/api/thing");

    expect(request?.headers.get("Content-Type")).toBeNull();
    await expect(request?.text()).resolves.toBe("");
  });
});

describe("api without a CSRF cookie", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  it("asks for one with the session's cookies, and sends no token when none comes", async () => {
    let token: string | null = "unread";
    server.use(
      http.get("/who/me", () => new HttpResponse(null, { status: 401 })),
      http.post("/api/thing", ({ request }) => {
        token = request.headers.get("X-XSRF-TOKEN");
        return new HttpResponse(null, { status: 204 });
      }),
    );
    const fetchSpy = vi.spyOn(globalThis, "fetch");

    await send("POST", "/api/thing");

    expect(fetchSpy).toHaveBeenCalledWith("/who/me", { credentials: "same-origin" });
    expect(token).toBeNull();
    fetchSpy.mockRestore();
  });
});

describe("ApiError", () => {
  it("describes a failure the server did not explain", () => {
    const error = new ApiError(500);

    expect(error.message).toBe("Request failed with status 500");
    expect(error.problem).toStrictEqual({ type: "about:blank", title: "", status: 500 });
  });

  it("takes its message from the problem's detail", () => {
    expect(
      new ApiError(404, { type: "about:blank", title: "Not Found", status: 404, detail: "No such note" }).message,
    ).toBe("No such note");
  });
});
