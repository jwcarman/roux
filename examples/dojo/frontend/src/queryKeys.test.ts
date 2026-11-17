import { describe, expect, it } from "vitest";
import { queryKeys } from "./queryKeys";

describe("queryKeys", () => {
  it("puts every members list under one prefix, so one invalidation refreshes them all", () => {
    const prefix = queryKeys.members.lists();
    expect(queryKeys.members.list({ search: "ada" }).slice(0, prefix.length)).toEqual(prefix);
    expect(queryKeys.members.list({}).slice(0, prefix.length)).toEqual(prefix);
  });

  it("keys each search on its own", () => {
    expect(queryKeys.members.list({ search: "ada" })).not.toEqual(queryKeys.members.list({ search: "grace" }));
  });
});
