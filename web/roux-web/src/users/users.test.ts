// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { server } from "../testing";
import {
  changeUserStatus,
  invitableRolesQuery,
  invitationSchema,
  inviteUser,
  MAX_NAME,
  renameMe,
  renameSchema,
  userActivitiesPage,
  userKeys,
  userQuery,
  usersPage,
} from "./users";

/** Runs a query's or a mutation's function as TanStack Query would. */
const live = { signal: new AbortController().signal };
function run<T>(fn: unknown, arg: unknown = live): Promise<T> {
  return (fn as (a: unknown) => Promise<T>)(arg);
}

let sent: { method: string; url: string; body: unknown }[];

beforeEach(() => {
  sent = [];
  document.cookie = "XSRF-TOKEN=token";
  const record = async ({ request }: { request: Request }) => {
    const text = await request.text();
    sent.push({
      method: request.method,
      url: new URL(request.url).pathname + new URL(request.url).search,
      body: text ? JSON.parse(text) : undefined,
    });
    return HttpResponse.json({ ok: true });
  };
  server.use(
    http.get("/api/roux/users", record),
    http.get("/api/roux/users/:id", record),
    http.get("/api/roux/users/:id/activities", record),
    http.get("/api/roux/roles/invitable", record),
    http.post("/api/roux/users/invitations", record),
    http.post("/api/roux/users/:id/:action", record),
    http.put("/api/roux/users/me", record),
  );
});

describe("the users keys", () => {
  it("put every users query under one prefix, apart from the app's own", () => {
    expect(userKeys.all).toEqual(["roux", "users"]);
    expect(userKeys.lists()).toEqual(["roux", "users", "list"]);
    expect(userKeys.list({ search: "ada" })).toEqual(["roux", "users", "list", { search: "ada" }]);
    expect(userKeys.detail("u-1")).toEqual(["roux", "users", "detail", "u-1"]);
    expect(userKeys.activities("u-1")).toEqual(["roux", "users", "detail", "u-1", "activities"]);
    expect(userKeys.invitableRoles()).toEqual(["roux", "roles", "invitable"]);
  });
});

describe("the users queries", () => {
  it("fetch a user, the invitable roles, a page of the directory and a user's history", async () => {
    await run(userQuery("u-1").queryFn);
    await run(invitableRolesQuery.queryFn);
    const page = usersPage({ search: "ada", role: "USER" });
    expect(page.queryKey).toEqual(userKeys.list({ search: "ada", role: "USER" }));
    await page.fetch({ pageIndex: 1, pageSize: 25 }, live.signal);
    const history = userActivitiesPage("u-1");
    expect(history.queryKey).toEqual(userKeys.activities("u-1"));
    await history.fetch({ pageIndex: 2 }, live.signal);
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      "GET /api/roux/users/u-1",
      "GET /api/roux/roles/invitable",
      "GET /api/roux/users?pageIndex=1&pageSize=25&search=ada&role=USER",
      "GET /api/roux/users/u-1/activities?pageIndex=2",
    ]);
    expect(userQuery("u-1").queryKey).toEqual(userKeys.detail("u-1"));
    expect(invitableRolesQuery.queryKey).toEqual(userKeys.invitableRoles());
  });

  it("stop fetching once the query is cancelled (the page was left)", async () => {
    const cancelled = new AbortController();
    cancelled.abort();
    await expect(run(userQuery("u-1").queryFn, { signal: cancelled.signal })).rejects.toThrow();
    await expect(run(invitableRolesQuery.queryFn, { signal: cancelled.signal })).rejects.toThrow();
  });
});

describe("the users mutations", () => {
  it("invite someone, refreshing the directory", async () => {
    await run(inviteUser.mutationFn, {
      name: "Ada",
      email: "ada@example.test",
      role: "USER",
    });
    expect(sent).toEqual([
      {
        method: "POST",
        url: "/api/roux/users/invitations",
        body: { name: "Ada", email: "ada@example.test", role: "USER" },
      },
    ]);
    expect(inviteUser.meta?.refreshes).toEqual([userKeys.lists()]);
  });

  it("deactivate or reactivate someone, refreshing their page, the directory and their history", async () => {
    const m = changeUserStatus("u-1");
    await run(m.mutationFn, { action: "deactivate" });
    await run(m.mutationFn, { action: "reactivate" });
    expect(sent.map((s) => `${s.method} ${s.url}`)).toEqual([
      "POST /api/roux/users/u-1/deactivate",
      "POST /api/roux/users/u-1/reactivate",
    ]);
    expect(m.meta?.refreshes).toEqual([userKeys.detail("u-1"), userKeys.lists(), userKeys.activities("u-1")]);
  });

  it("rename the signed-in user from the version the form read", async () => {
    await run(renameMe(4).mutationFn, { displayName: "Ada L." });
    expect(sent).toEqual([
      {
        method: "PUT",
        url: "/api/roux/users/me",
        body: { displayName: "Ada L.", version: 4 },
      },
    ]);
  });
});

describe("the users rules", () => {
  it("are the server's: a name of at most 80 characters, an email address, a role", () => {
    expect(MAX_NAME).toBe(80);
    expect(
      invitationSchema.safeParse({
        name: " Ada ",
        email: " ada@example.test ",
        role: "USER",
      }).data,
    ).toEqual({ name: "Ada", email: "ada@example.test", role: "USER" });
    expect(
      invitationSchema
        .safeParse({
          name: "x".repeat(81),
          email: "ada@",
          role: "",
        })
        .error?.issues.map((i) => i.path[0]),
    ).toEqual(["name", "email", "role"]);
    expect(renameSchema.safeParse({ displayName: "x".repeat(80) }).success).toBe(true);
    expect(renameSchema.safeParse({ displayName: "x".repeat(81) }).success).toBe(false);
  });
});
