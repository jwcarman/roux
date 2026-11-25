// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import {
  invalidFields,
  pageOf,
  server,
  serverError,
} from "@jwcarman/roux-web/testing";
import { ITEMS_READ, ITEMS_WRITE } from "../../../permissions.gen";
import { renderRoute } from "../../../testing/route";

const ITEMS = [
  {
    id: "i-1",
    title: "Draft the agenda",
    day: "2026-11-25",
    at: "10:30",
    done: false,
    assigneeNames: ["Ada Lovelace", "Grace Hopper"],
    version: 0,
  },
  {
    id: "i-2",
    title: "Send the invitations",
    day: "2026-11-20",
    at: null,
    done: true,
    assigneeNames: ["Test User"],
    version: 3,
  },
];

const TEAM = [
  {
    id: "id-1",
    displayName: "Test User",
    email: "t@example.org",
    role: "OWNER",
    status: "ACTIVE",
  },
  {
    id: "u-2",
    displayName: "Grace Hopper",
    email: "g@example.org",
    role: "USER",
    status: "ACTIVE",
  },
];

/** Every list request's query string, in order; and every item added. */
let requests: URLSearchParams[];
let added: unknown[];

beforeEach(() => {
  requests = [];
  added = [];
  document.cookie = "XSRF-TOKEN=token";
  server.use(
    http.get("/api/items", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      return HttpResponse.json(pageOf(ITEMS, { pageIndex: 0, pageSize: 20 }));
    }),
    http.get("/api/roux/users", () =>
      HttpResponse.json(pageOf(TEAM, { pageIndex: 0, pageSize: 100 })),
    ),
    http.post("/api/items", async ({ request }) => {
      const body = await request.json();
      added.push(body);
      return HttpResponse.json(
        { ...ITEMS[0], title: "Order the venue" },
        { status: 201 },
      );
    }),
  );
});

const latest = () => requests[requests.length - 1];

/**
 * The Add item button, once the page and the team have loaded: until then it is a different,
 * disabled one. The whole route renders first (shell, page, list), which on CI's runner, with
 * coverage on, can take longer than testing-library's one-second default.
 */
async function enabledAddButton() {
  await screen.findByRole(
    "link",
    { name: "Draft the agenda" },
    { timeout: 5000 },
  );
  await waitFor(
    () =>
      expect(screen.getByRole("button", { name: "Add item" })).toBeEnabled(),
    { timeout: 5000 },
  );
  return screen.getByRole("button", { name: "Add item" });
}

describe("/items", () => {
  it("lists the items: when, title (a link to the item), who and status", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ] });

    const table = await screen.findByRole("table", { name: "Items" });
    expect(
      await within(table).findByRole("link", { name: "Draft the agenda" }),
    ).toHaveAttribute("href", "/items/i-1");
    expect(
      within(table).getByRole("cell", { name: "Wed, Nov 25 · 10:30" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Fri, Nov 20 · All day" }),
    ).toBeInTheDocument();
    expect(
      within(table).getByRole("cell", { name: "Ada Lovelace, Grace Hopper" }),
    ).toBeInTheDocument();
    expect(within(table).getByText("Done")).toBeInTheDocument();
    expect(within(table).getByText("Open")).toBeInTheDocument();
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual([
      "When",
      "Title",
      "Assigned to",
      "Status",
    ]);
    expect(headers[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("asks for the first page by day, with no filters", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ] });
    await screen.findByRole("link", { name: "Draft the agenda" });
    expect(Object.fromEntries(latest())).toEqual({
      pageIndex: "0",
      pageSize: "25",
      sortBy: "DAY",
      sortDirection: "ASC",
    });
  });

  it("filters by when, whose and status, back to the first page, all in the URL", async () => {
    const { router } = renderRoute("/items?pageIndex=2", {
      permissions: [ITEMS_READ],
    });
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Draft the agenda" });

    await user.click(screen.getByRole("button", { name: "Overdue" }));
    await user.click(screen.getByRole("button", { name: "Mine" }));
    await user.click(screen.getByRole("button", { name: "Open" }));

    await waitFor(() =>
      expect(Object.fromEntries(latest())).toMatchObject({
        when: "overdue",
        assignee: "me",
        status: "open",
        pageIndex: "0",
      }),
    );
    expect(router.state.location.search).toEqual({
      when: "overdue",
      assignee: "me",
      status: "open",
    });

    await user.click(screen.getByRole("button", { name: "Any time" }));
    await user.click(screen.getByRole("button", { name: "Anyone" }));
    await user.click(screen.getByRole("button", { name: "Any status" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("filters by a person from the URL, and drops one that is not an id", async () => {
    const { router } = renderRoute(
      "/items?assignee=0b6c2c2e-1f2a-4c39-9a7e-1f6d7c1a2b3c&when=soon",
      { permissions: [ITEMS_READ] },
    );
    await screen.findByRole("link", { name: "Draft the agenda" });
    expect(latest().get("assignee")).toBe(
      "0b6c2c2e-1f2a-4c39-9a7e-1f6d7c1a2b3c",
    );
    expect(latest().get("when")).toBeNull();
    expect(screen.getByRole("button", { name: "Anyone" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );

    await router.navigate({ to: "/items", search: { assignee: "nobody" } });
    await waitFor(() => expect(latest().get("assignee")).toBeNull());
  });

  it("shows Mine chosen when the URL asks for the caller's items", async () => {
    renderRoute("/items?assignee=me", { permissions: [ITEMS_READ] });
    await screen.findByRole("link", { name: "Draft the agenda" });
    expect(screen.getByRole("button", { name: "Mine" })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(latest().get("assignee")).toBe("me");
  });

  it("searches as the user types, replacing the history entry", async () => {
    const { router } = renderRoute("/items", { permissions: [ITEMS_READ] });
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Draft the agenda" });
    const entries = router.history.length;
    await user.type(
      screen.getByRole("searchbox", { name: "Search items" }),
      "agenda",
    );
    await waitFor(() => expect(latest().get("search")).toBe("agenda"));
    expect(router.history).toHaveLength(entries);
  });

  it("sorts by title, then by who it is assigned to", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ] });
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Draft the agenda" });
    await user.click(screen.getByRole("button", { name: "Title" }));
    await waitFor(() => expect(latest().get("sortBy")).toBe("TITLE"));
    await user.click(screen.getByRole("button", { name: "Assigned to" }));
    await waitFor(() => expect(latest().get("sortBy")).toBe("ASSIGNEE"));
  });

  it("offers Add item only to someone who may write items", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ] });
    await screen.findByRole("link", { name: "Draft the agenda" });
    expect(screen.queryByRole("button", { name: "Add item" })).toBeNull();
  });

  it("adds an item: today, all day and assigned to whoever adds it, unless changed", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
    const user = userEvent.setup();
    await user.click(await enabledAddButton());
    const dialog = await screen.findByRole("dialog", { name: "Add an item" });
    expect(within(dialog).queryByLabelText(/^Time/)).toBeNull();
    expect(
      within(dialog).getByRole("group", { name: "Assigned to" }),
    ).not.toHaveAttribute("data-invalid");
    expect(within(dialog).queryByRole("checkbox", { name: "Done" })).toBeNull();

    await user.type(within(dialog).getByLabelText(/^Title/), "Order the venue");
    await user.click(within(dialog).getByText("All day"));
    await user.type(within(dialog).getByLabelText(/^Time/), "14:15");
    await user.click(within(dialog).getByText("Grace Hopper"));
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(added).toHaveLength(1));
    expect(added[0]).toEqual({
      title: "Order the venue",
      notes: "",
      day: expect.stringMatching(/^\d{4}-\d{2}-\d{2}$/),
      at: "14:15",
      assigneeIds: ["id-1", "u-2"],
      done: false,
    });
    expect(
      await screen.findByText("Added Order the venue"),
    ).toBeInTheDocument();
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("keeps the dialog open with the server's words when it refuses the item", async () => {
    server.use(
      http.post("/api/items", () =>
        invalidFields({ assigneeIds: "Must be active members of the team" }),
      ),
    );
    renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
    const user = userEvent.setup();
    await user.click(await enabledAddButton());
    const dialog = await screen.findByRole("dialog", { name: "Add an item" });
    await user.type(within(dialog).getByLabelText(/^Title/), "Order the venue");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(
      await within(dialog).findByText("Must be active members of the team"),
    ).toBeInTheDocument();
    expect(
      within(dialog).getByRole("group", { name: "Assigned to" }),
    ).toHaveAttribute("data-invalid");
  });

  it("says so when the server cannot add the item", async () => {
    server.use(http.post("/api/items", () => serverError()));
    renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
    const user = userEvent.setup();
    await user.click(await enabledAddButton());
    const dialog = await screen.findByRole("dialog", { name: "Add an item" });
    await user.type(within(dialog).getByLabelText(/^Title/), "Order the venue");
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(
      await screen.findByText("Could not add the item"),
    ).toBeInTheDocument();
  });

  it("refuses an item nobody is assigned to, before sending it", async () => {
    renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
    const user = userEvent.setup();
    await user.click(await enabledAddButton());
    const dialog = await screen.findByRole("dialog", { name: "Add an item" });
    await user.type(within(dialog).getByLabelText(/^Title/), "Order the venue");
    await user.click(within(dialog).getByText("Test User"));
    await user.click(within(dialog).getByRole("button", { name: "Add item" }));
    expect(
      await within(dialog).findByText("Must not be empty"),
    ).toBeInTheDocument();
    expect(added).toEqual([]);
  });

  it("keeps Add item disabled until the team has loaded", async () => {
    server.use(
      http.get("/api/roux/users", () => new Promise<Response>(() => {})),
    );
    renderRoute("/items", { permissions: [ITEMS_READ, ITEMS_WRITE] });
    expect(
      await screen.findByRole("button", { name: "Add item" }),
    ).toBeDisabled();
  });
});
