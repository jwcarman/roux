// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { choicesOf } from "./AssigneesField";
import { bodyOf, deleteItem, itemQuery, itemSchema, teamQuery, updateItem, valuesOf, type ItemValues } from "./items";

type Fetch = (context: { signal: AbortSignal }) => Promise<unknown>;

/** Runs a query's fetch as TanStack Query would, with a live or an already cancelled signal. */
function fetchWith(queryFn: unknown, cancelled = false) {
  const controller = new AbortController();
  if (cancelled) {
    controller.abort();
  }
  return (queryFn as Fetch)({ signal: controller.signal });
}

const VALUES: ItemValues = {
  title: "Draft the agenda",
  notes: "",
  day: "2026-11-25",
  allDay: false,
  at: "10:30",
  assigneeIds: ["u-1"],
  done: false,
};

function parse(values: Partial<ItemValues>) {
  return itemSchema.safeParse({ ...VALUES, ...values });
}

function errorsOf(values: Partial<ItemValues>) {
  const result = parse(values);
  return result.success
    ? {}
    : Object.fromEntries(result.error.issues.map((issue) => [issue.path.join("."), issue.message]));
}

describe("an item's form", () => {
  it("needs a time unless it is all day", () => {
    expect(errorsOf({ at: "" })).toEqual({ at: "Must not be empty" });
    expect(errorsOf({ at: "", allDay: true })).toEqual({});
  });

  it("needs someone to be assigned, and at most 50", () => {
    expect(errorsOf({ assigneeIds: [] })).toEqual({
      assigneeIds: "Must not be empty",
    });
    const fifty = Array.from({ length: 50 }, (_, i) => `u-${i}`);
    expect(errorsOf({ assigneeIds: fifty })).toEqual({});
    expect(errorsOf({ assigneeIds: [...fifty, "u-50"] })).toEqual({
      assigneeIds: "Must be at most 50",
    });
  });

  it("needs a title of at most 120 and notes of at most 2000", () => {
    expect(errorsOf({ title: "x".repeat(120), notes: "x".repeat(2000) })).toEqual({});
    expect(Object.keys(errorsOf({ title: "x".repeat(121) }))).toEqual(["title"]);
    expect(Object.keys(errorsOf({ notes: "x".repeat(2001) }))).toEqual(["notes"]);
  });
});

describe("what a save sends", () => {
  it("sends the time without seconds, and the version when editing", () => {
    const parsed = itemSchema.parse({ ...VALUES, at: "10:30:15" });
    expect(bodyOf(parsed, 3)).toEqual({
      title: "Draft the agenda",
      notes: "",
      day: "2026-11-25",
      at: "10:30",
      assigneeIds: ["u-1"],
      done: false,
      version: 3,
    });
  });

  it("sends no time for an all-day item, and empty notes as empty", () => {
    const parsed = itemSchema.parse({ ...VALUES, allDay: true, notes: "  " });
    expect(bodyOf(parsed)).toMatchObject({ at: null, notes: "" });
    expect(bodyOf(parsed).version).toBeUndefined();
  });
});

describe("an item's values", () => {
  it("edits an item as it was saved", () => {
    const item = {
      id: "i-1",
      title: "Retrospective",
      notes: "bring cake",
      day: "2026-12-02",
      at: null,
      done: true,
      assigneeNames: ["Grace"],
      version: 2,
      assignees: [{ id: "u-2", name: "Grace", active: true }],
      createdBy: "u-1",
      canDelete: true,
    };
    expect(valuesOf(item)).toEqual({
      title: "Retrospective",
      notes: "bring cake",
      day: "2026-12-02",
      allDay: true,
      at: "",
      assigneeIds: ["u-2"],
      done: true,
    });
    expect(valuesOf({ ...item, at: "09:15" })).toMatchObject({
      allDay: false,
      at: "09:15",
    });
  });
});

describe("who may be chosen", () => {
  it("is the active team, then anyone deactivated who is still on the item", () => {
    const team = [
      { id: "u-1", displayName: "Ada" },
      { id: "u-2", displayName: "Grace" },
    ];
    expect(
      choicesOf(team, [
        { id: "u-2", name: "Grace", active: true },
        { id: "u-9", name: "Kay", active: false },
      ]),
    ).toEqual([
      { id: "u-1", name: "Ada", active: true },
      { id: "u-2", name: "Grace", active: true },
      { id: "u-9", name: "Kay", active: false },
    ]);
    expect(choicesOf(team)).toHaveLength(2);
  });

  it("lists a deactivated person once, as active, if they are back on the team", () => {
    expect(
      choicesOf(
        [
          { id: "u-1", displayName: "Ada" },
          { id: "u-9", displayName: "Kay" },
        ],
        [{ id: "u-9", name: "Kay", active: false }],
      ),
    ).toEqual([
      { id: "u-1", name: "Ada", active: true },
      { id: "u-9", name: "Kay", active: true },
    ]);
  });
});

describe("the items queries", () => {
  it("fetch an item, and the team's active members by name", async () => {
    let team: URLSearchParams | undefined;
    server.use(
      http.get("/api/items/i-1", () => HttpResponse.json({ id: "i-1" })),
      http.get("/api/roux/users", ({ request }) => {
        team = new URL(request.url).searchParams;
        return HttpResponse.json({ data: [{ id: "u-1" }] });
      }),
    );
    await expect(fetchWith(itemQuery("i-1").queryFn)).resolves.toEqual({
      id: "i-1",
    });
    await expect(fetchWith(teamQuery.queryFn)).resolves.toEqual([{ id: "u-1" }]);
    expect(Object.fromEntries(team ?? [])).toEqual({
      status: "ACTIVE",
      pageSize: "100",
      sortBy: "NAME",
    });
  });

  it("stop fetching once the query is cancelled (the page was left)", async () => {
    server.use(
      http.get("/api/items/i-1", () => HttpResponse.json({ id: "i-1" })),
      http.get("/api/roux/users", () => HttpResponse.json({ data: [] })),
    );
    await expect(fetchWith(itemQuery("i-1").queryFn, true)).rejects.toThrow();
    await expect(fetchWith(teamQuery.queryFn, true)).rejects.toThrow();
  });
});

describe("what a change refreshes", () => {
  it("is the lists, the items surface's queries, and a changed item's own page", () => {
    expect(updateItem("i-1", 2).meta).toEqual({
      refreshes: [
        ["items", "list"],
        ["items", "detail", "i-1"],
        ["queries", "items"],
        ["queries", "itemCounts"],
      ],
    });
    expect(deleteItem("i-1").meta).toEqual({
      refreshes: [
        ["items", "list"],
        ["queries", "items"],
        ["queries", "itemCounts"],
      ],
    });
  });
});
