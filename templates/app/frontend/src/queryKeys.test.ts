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
});
