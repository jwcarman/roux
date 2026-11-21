import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("puts every users list under one prefix, so one invalidation refreshes them all", () => {
    const prefix = queryKeys.users.lists();
    expect(queryKeys.users.list({ search: "ada" }).slice(0, prefix.length)).toEqual(prefix);
    expect(queryKeys.users.list({}).slice(0, prefix.length)).toEqual(prefix);
  });

  it("keys each search on its own", () => {
    expect(queryKeys.users.list({ search: "ada" })).not.toEqual(queryKeys.users.list({ search: "grace" }));
  });

  it("gives each feature its own prefix", () => {
    expect([queryKeys.users.all, queryKeys.roles.all, queryKeys.passkeys]).toEqual([["users"], ["roles"], ["passkeys"]]);
  });

  it("keys each user's detail under the users prefix, one per user", () => {
    expect(queryKeys.users.detail("u-1")).toEqual(["users", "detail", "u-1"]);
    expect(queryKeys.users.detail("u-1")).not.toEqual(queryKeys.users.detail("u-2"));
  });

  it("keys the roles an invitation may give under the roles prefix", () => {
    expect(queryKeys.roles.invitable()).toEqual(["roles", "invitable"]);
  });
});
