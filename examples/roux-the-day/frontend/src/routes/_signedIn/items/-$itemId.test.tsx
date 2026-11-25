// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { notFound, pageOf, paletteOf, server, serverError, stale } from "@jwcarman/roux-web/testing";
import type { ItemDetail } from "../../../api";
import { ITEMS_READ, ITEMS_WRITE } from "../../../permissions.gen";
import { renderRoute } from "../../../testing/route";

const ITEM: ItemDetail = {
  id: "i-1",
  title: "Draft the agenda",
  notes: "two pages",
  day: "2026-11-25",
  at: "10:30",
  done: false,
  assigneeNames: ["Grace Hopper", "Kay Antonelli"],
  version: 4,
  assignees: [
    { id: "u-2", name: "Grace Hopper", active: true },
    { id: "u-9", name: "Kay Antonelli", active: false },
  ],
  createdBy: "id-1",
  canDelete: true,
};

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

let saved: unknown[];
let deleted: number;

function serve(item: ItemDetail) {
  server.use(
    http.get("/api/items/i-1", () => HttpResponse.json(item)),
    http.get("/api/items", () => HttpResponse.json(pageOf([], { pageIndex: 0, pageSize: 20 }))),
  );
}

beforeEach(() => {
  saved = [];
  deleted = 0;
  document.cookie = "XSRF-TOKEN=token";
  serve(ITEM);
  server.use(
    http.get("/api/roux/users", () => HttpResponse.json(pageOf(TEAM, { pageIndex: 0, pageSize: 100 }))),
    http.put("/api/items/i-1", async ({ request }) => {
      const body = (await request.json()) as Record<string, unknown>;
      saved.push(body);
      return HttpResponse.json({ ...ITEM, ...body, version: 5 });
    }),
    http.delete("/api/items/i-1", () => {
      deleted++;
      return new HttpResponse(null, { status: 204 });
    }),
  );
});

const WRITER = { permissions: [ITEMS_READ, ITEMS_WRITE] };

async function open(permissions = WRITER) {
  const rendered = renderRoute("/items/i-1", permissions);
  await screen.findByRole("heading", { name: "Draft the agenda" });
  return { ...rendered, user: userEvent.setup() };
}

describe("/items/$itemId", () => {
  it("shows the item in its form, with whoever was deactivated since marked", async () => {
    await open();
    expect(await screen.findByLabelText(/^Title/)).toHaveValue("Draft the agenda");
    expect(screen.getByLabelText(/^Day/)).toHaveValue("2026-11-25");
    expect(screen.getByLabelText(/^Time/)).toHaveValue("10:30");
    expect(screen.getByLabelText(/^Notes/)).toHaveValue("two pages");
    const who = screen.getByRole("group", { name: "Assigned to" });
    expect(within(who).getByRole("checkbox", { name: "Grace Hopper" })).toBeChecked();
    expect(within(who).getByRole("checkbox", { name: "Test User" })).not.toBeChecked();
    expect(
      within(who).getByRole("checkbox", {
        name: "Kay Antonelli (deactivated)",
      }),
    ).toBeChecked();
    expect(screen.getByRole("link", { name: "All items" })).toHaveAttribute("href", "/items");
  });

  it("saves from the version it was read at, after replacing someone deactivated", async () => {
    const { user } = await open();
    await screen.findByLabelText(/^Title/);
    const who = screen.getByRole("group", { name: "Assigned to" });
    await user.click(within(who).getByText("Kay Antonelli (deactivated)"));
    await user.click(within(who).getByText("Test User"));
    await user.click(screen.getByText("Done"));
    await user.click(screen.getByRole("button", { name: "Save item" }));
    await waitFor(() => expect(saved).toHaveLength(1));
    expect(saved[0]).toEqual({
      title: "Draft the agenda",
      notes: "two pages",
      day: "2026-11-25",
      at: "10:30",
      assigneeIds: ["u-2", "id-1"],
      done: true,
      version: 4,
    });
    expect(await screen.findByText("Item saved")).toBeInTheDocument();
  });

  it("says so when someone else changed the item first", async () => {
    server.use(http.put("/api/items/i-1", () => stale()));
    const { user } = await open();
    await user.type(await screen.findByLabelText(/^Title/), "!");
    await user.click(screen.getByRole("button", { name: "Save item" }));
    expect(await screen.findByText("Could not save the item")).toBeInTheDocument();
  });

  it("shows no form to someone who may only read items", async () => {
    await open({ permissions: [ITEMS_READ] });
    expect(screen.queryByLabelText(/^Title/)).toBeNull();
    expect(screen.queryByRole("button", { name: "Save item" })).toBeNull();
  });

  it("deletes the item, once asked, and goes back to the list", async () => {
    const { user, router } = await open();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog", {
      name: "Delete Draft the agenda?",
    });
    expect(within(question).getByText("It is gone for everyone on the team.")).toBeInTheDocument();
    expect(paletteOf(within(question).getByRole("button", { name: "Delete" }))).toBe("red");
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    await waitFor(() => expect(router.state.location.pathname).toBe("/items"));
    expect(deleted).toBe(1);
    expect(await screen.findByText("Deleted Draft the agenda")).toBeInTheDocument();
  });

  it("deletes nothing when the question is cancelled", async () => {
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(deleted).toBe(0);
  });

  it("says so when the delete is refused", async () => {
    server.use(http.delete("/api/items/i-1", () => serverError()));
    const { user } = await open();
    await user.click(screen.getByRole("button", { name: "Delete" }));
    const question = await screen.findByRole("alertdialog");
    await user.click(within(question).getByRole("button", { name: "Delete" }));
    expect(await screen.findByText("Could not delete Draft the agenda")).toBeInTheDocument();
  });

  it("offers Delete only to the item's author or an owner", async () => {
    serve({ ...ITEM, canDelete: false });
    await open();
    expect(screen.queryByRole("button", { name: "Delete" })).toBeNull();
  });

  it("shows an all-day item without a time", async () => {
    serve({ ...ITEM, at: null });
    await open();
    expect(await screen.findByRole("checkbox", { name: "All day" })).toBeChecked();
    expect(screen.queryByLabelText(/^Time/)).toBeNull();
  });

  it("is not found when the item does not exist", async () => {
    server.use(http.get("/api/items/i-1", () => notFound("No such item")));
    renderRoute("/items/i-1", WRITER);
    expect(await screen.findByText("Item not found")).toBeInTheDocument();
  });

  it("shows the error page when the item cannot be loaded", async () => {
    server.use(http.get("/api/items/i-1", () => serverError()));
    renderRoute("/items/i-1", WRITER);
    expect(await screen.findByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();
  });
});
