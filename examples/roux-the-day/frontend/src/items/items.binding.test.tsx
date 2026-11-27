// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { invalidFields, pageOf, server } from "@jwcarman/roux-web/testing";
import type { ItemRow } from "../contract.gen";
import { ITEMS_READ, ITEMS_WRITE } from "../permissions.gen";
import { renderRoute } from "../testing/route";

const AGENDA: ItemRow = {
  id: "i-1",
  title: "Draft the agenda",
  day: "2026-11-25",
  at: "10:30",
  assigneeNames: ["Ada Lovelace", "Grace Hopper"],
  status: "Open",
  version: 0,
};
const INVITATIONS: ItemRow = {
  id: "i-2",
  title: "Send the invitations",
  day: "2026-11-20",
  at: null,
  assigneeNames: ["Test User"],
  status: "Done",
  version: 3,
};

/** The items on the server; each items request's query string and each addItem body, in order. */
let rows: ItemRow[];
let asked: URLSearchParams[];
let added: unknown[];

beforeEach(() => {
  rows = [AGENDA, INVITATIONS];
  asked = [];
  added = [];
  document.cookie = "XSRF-TOKEN=token";
  server.use(
    http.get("/api/queries/items", ({ request }) => {
      asked.push(new URL(request.url).searchParams);
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
    http.get("/api/queries/itemCounts", () =>
      HttpResponse.json({ open: rows.filter((row) => row.status === "Open").length, overdue: 1, today: 0 }),
    ),
    http.post("/api/commands/addItem", async ({ request }) => {
      const body = (await request.json()) as { title: string; day: string };
      added.push(body);
      if (body.title === "") return invalidFields({ title: "The server needs a title" });
      rows = [...rows, { ...AGENDA, id: "i-3", title: body.title, day: body.day || "2026-11-26", at: null }];
      return HttpResponse.json({ result: { id: "i-3" }, events: ["itemsChanged"] });
    }),
  );
});

const open = () => renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
const latest = () => Object.fromEntries(asked[asked.length - 1]);
/** The Open stat's number: the Stat shows its label, then its value. */
const openCount = () => screen.getByText("Open", { selector: "dt" }).nextElementSibling?.textContent;

describe("the items surface", () => {
  it("shows the counts and the list: day, time, title (a link to the item), who and status", async () => {
    open();
    const table = await screen.findByRole("table", {}, { timeout: 5000 });
    expect(within(table).getByRole("link", { name: "Draft the agenda" })).toHaveAttribute("href", "/items/i-1");
    expect(within(table).getByText("Ada Lovelace, Grace Hopper")).toBeInTheDocument();
    expect(within(table).getByText("Done")).toBeInTheDocument();
    expect(openCount()).toBe("1");
    expect(latest()).toEqual({
      search: "",
      when: "all",
      status: "",
      assignee: "anyone",
      pageIndex: "0",
      sortBy: "DAY",
      sortDirection: "ASC",
    });
  });

  it("asks for the overdue items, from the first page, when Overdue is chosen", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.click(within(screen.getByRole("group", { name: "When" })).getByRole("button", { name: "Overdue" }));
    await waitFor(() => expect(latest()).toMatchObject({ when: "overdue", pageIndex: "0" }));
  });

  it("adds an item from its title and day, then the list and the counts refresh and the draft clears", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.type(screen.getByLabelText(/^New item/), "Order the venue");
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByRole("link", { name: "Order the venue" })).toBeInTheDocument();
    expect(added).toEqual([{ title: "Order the venue", day: "" }]);
    expect(openCount()).toBe("2");
    expect(await screen.findByText("Item added")).toBeInTheDocument();
    expect(screen.getByLabelText<HTMLInputElement>(/^New item/).value).toBe("");
  });

  it("shows the server's word on a field under that field", async () => {
    open();
    await screen.findByRole("table", {}, { timeout: 5000 });
    await userEvent.click(screen.getByRole("button", { name: "Add item" }));
    expect(await screen.findByText("The server needs a title")).toBeInTheDocument();
    expect(added).toEqual([{ title: "", day: "" }]);
  });
});
