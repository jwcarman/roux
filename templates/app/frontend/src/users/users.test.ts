// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { invitableRolesQuery, userQuery } from "./users";

/** Runs a query's fetch as TanStack Query would, with a signal that is already cancelled. */
function fetchCancelled(queryFn: unknown) {
  const cancelled = new AbortController();
  cancelled.abort();
  return (queryFn as (context: { signal: AbortSignal }) => Promise<unknown>)({ signal: cancelled.signal });
}

describe("the users queries", () => {
  it("fetch a user and the invitable roles", async () => {
    server.use(
      http.get("/api/users/u-1", () => HttpResponse.json({ id: "u-1" })),
      http.get("/api/roles/invitable", () => HttpResponse.json(["USER"])),
    );
    const live = { signal: new AbortController().signal };
    await expect((userQuery("u-1").queryFn as (context: typeof live) => Promise<unknown>)(live)).resolves.toEqual({ id: "u-1" });
    await expect((invitableRolesQuery.queryFn as (context: typeof live) => Promise<unknown>)(live)).resolves.toEqual(["USER"]);
  });

  it("stop fetching a user once the query is cancelled (the page was left)", async () => {
    server.use(http.get("/api/users/u-1", () => HttpResponse.json({ id: "u-1" })));
    await expect(fetchCancelled(userQuery("u-1").queryFn)).rejects.toThrow();
  });

  it("stop fetching the invitable roles once the query is cancelled", async () => {
    server.use(http.get("/api/roles/invitable", () => HttpResponse.json(["USER"])));
    await expect(fetchCancelled(invitableRolesQuery.queryFn)).rejects.toThrow();
  });
});
