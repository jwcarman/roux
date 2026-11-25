import { describe, expect, it } from "vitest";
import { userKeys } from "@jwcarman/roux-web/users";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("puts every items list under one prefix, so one invalidation refreshes them all", () => {
    const prefix = queryKeys.items.lists();
    expect(queryKeys.items.list({ search: "agenda" }).slice(0, prefix.length)).toEqual(prefix);
    expect(queryKeys.items.list({}).slice(0, prefix.length)).toEqual(prefix);
  });

  it("keys each search on its own", () => {
    expect(queryKeys.items.list({ search: "agenda" })).not.toEqual(queryKeys.items.list({ search: "venue" }));
  });

  it("keys each item's detail under the items prefix, one per item", () => {
    expect(queryKeys.items.detail("i-1")).toEqual(["items", "detail", "i-1"]);
    expect(queryKeys.items.detail("i-1")).not.toEqual(queryKeys.items.detail("i-2"));
  });

  it("keeps the app's keys apart from roux's", () => {
    expect([queryKeys.items.all, queryKeys.team.active()]).toEqual([["items"], ["team", "active"]]);
    expect(userKeys.all[0]).toBe("roux");
  });
});
