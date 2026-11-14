// @vitest-environment jsdom
import { afterEach, describe, expect, it } from "vitest";
import { configureApi } from "./config";
import { path, resolveUrl } from "./url";

describe("path", () => {
  it("encodes every value it inserts", () => {
    expect(path`customers/${"a/b c"}/notes/${7}`).toBe("customers/a%2Fb%20c/notes/7");
  });
});

describe("resolveUrl", () => {
  afterEach(() => {
    configureApi({ baseUrl: "/api" });
  });

  it("puts a path without a leading slash under baseUrl", () => {
    expect(resolveUrl("customers")).toBe("/api/customers");
  });

  it("uses one slash between a configured baseUrl and the path", () => {
    configureApi({ baseUrl: "/v2/" });

    expect(resolveUrl("customers")).toBe("/v2/customers");
  });

  it("uses a path with a leading slash as it is", () => {
    expect(resolveUrl("/who/me")).toBe("/who/me");
  });

  it("builds the query string, leaving out null and undefined and repeating array keys", () => {
    expect(
      resolveUrl("customers", {
        search: "ann",
        page: 0,
        status: ["LEAD", "ACTIVE"],
        sort: undefined,
        owner: null,
        archived: false,
      }),
    ).toBe("/api/customers?search=ann&page=0&status=LEAD&status=ACTIVE&archived=false");
  });

  it("adds no ? for empty params", () => {
    expect(resolveUrl("customers", {})).toBe("/api/customers");
  });

  it("extends an existing query with &", () => {
    expect(resolveUrl("customers?x=1", { y: 2 })).toBe("/api/customers?x=1&y=2");
  });
});
