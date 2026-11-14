// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { server } from "../testing/server";
import { onSessionLost, send } from "./client";
import { apiSettings, configureApi } from "./config";

/** Answers every request `status`, and records each request's path in order. */
function record(status = 204): string[] {
  const paths: string[] = [];
  server.use(
    http.all("*", ({ request }) => {
      paths.push(new URL(request.url).pathname);
      return new HttpResponse(null, { status });
    }),
  );
  return paths;
}

describe("api settings", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=; expires=Thu, 01 Jan 1970 00:00:00 GMT";
  });

  afterEach(() => {
    configureApi({ baseUrl: "/api", csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" });
  });

  it("defaults to who's paths", () => {
    expect(apiSettings()).toEqual({ baseUrl: "/api", csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" });
  });

  it("merges a partial setting", () => {
    configureApi({ sessionPathPrefix: "/rest/" });

    expect(apiSettings()).toEqual({ baseUrl: "/api", csrfBootstrapPath: "/who/me", sessionPathPrefix: "/rest/" });
  });

  it("hands out a copy, so only configureApi changes the settings", () => {
    apiSettings().sessionPathPrefix = "/changed/";

    expect(apiSettings().sessionPathPrefix).toBe("/api/");
  });

  it("bootstraps CSRF from the configured path", async () => {
    configureApi({ csrfBootstrapPath: "/auth/me" });
    const paths = record();

    await send("POST", "/rest/x");

    expect(paths).toEqual(["/auth/me", "/rest/x"]);
  });

  it("reports a lost session under the configured prefix only", async () => {
    configureApi({ sessionPathPrefix: "/rest/" });
    record(401);
    const lost = vi.fn<() => void>();
    const unsubscribe = onSessionLost(lost);

    await send("POST", "/rest/x");
    expect(lost).toHaveBeenCalledOnce();
    await send("POST", "/api/x");
    expect(lost).toHaveBeenCalledOnce();
    unsubscribe();
  });

  it("reads settings at call time", async () => {
    const paths = record();

    await send("POST", "/api/x");
    configureApi({ csrfBootstrapPath: "/auth/me" });
    await send("POST", "/api/x");

    expect(paths).toEqual(["/who/me", "/api/x", "/auth/me", "/api/x"]);
  });
});
