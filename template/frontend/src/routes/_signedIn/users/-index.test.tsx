// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { pageOf, server } from "@jwcarman/roux-web/testing";
import { USERS_INVITE, USERS_READ } from "../../../permissions.gen";
import { renderRoute } from "../../../testing/route";

const USERS = [
  { id: "u-1", displayName: "Ada Lovelace", email: "ada@example.org", role: "OWNER", status: "ACTIVE" },
  { id: "u-2", displayName: "Grace Hopper", email: "grace@example.org", role: "USER", status: "ACTIVE" },
];

/** Enough users for a second page. */
const MANY = Array.from({ length: 30 }, (_, i) => ({ ...USERS[1], id: `m-${i}`, displayName: `User ${i}` }));

/** Every directory request's query string, in order. */
let requests: URLSearchParams[];

beforeEach(() => {
  requests = [];
  server.use(
    http.get("/api/users", ({ request }) => {
      const params = new URL(request.url).searchParams;
      requests.push(params);
      const pageIndex = Number(params.get("pageIndex") ?? 0);
      const pageSize = Number(params.get("pageSize") ?? 20);
      return HttpResponse.json(pageOf(pageIndex === 0 ? USERS : MANY, { pageIndex, pageSize }));
    }),
    http.get("/api/roles/invitable", () => HttpResponse.json(["USER"])),
  );
});

describe("/users", () => {
  it("lists the users, each name a link to their page and each role by its label", async () => {
    renderRoute("/users", { permissions: [USERS_READ] });

    const table = await screen.findByRole("table", { name: "Users" });
    expect(await within(table).findByRole("link", { name: "Grace Hopper" })).toHaveAttribute("href", "/users/u-2");
    expect(within(table).getByRole("cell", { name: "Owner" })).toBeInTheDocument();
    expect(within(table).getByRole("cell", { name: "User" })).toBeInTheDocument();
  });

  it("has a Name, an Email and a Role column, sorted by name to start", async () => {
    renderRoute("/users", { permissions: [USERS_READ] });

    const table = await screen.findByRole("table", { name: "Users" });
    const headers = within(table).getAllByRole("columnheader");
    expect(headers.map((header) => header.textContent)).toEqual(["Name", "Email", "Role"]);
    expect(headers[0]).toHaveAttribute("aria-sort", "ascending");
  });

  it("shows the active users to start, with Active the chosen status", async () => {
    renderRoute("/users", { permissions: [USERS_READ] });

    const status = await screen.findByRole("group", { name: "Status" });
    expect(within(status).getByRole("button", { name: "Active" })).toHaveAttribute("aria-pressed", "true");
  });

  it("offers the invite form only to someone who may invite", async () => {
    renderRoute("/users", { permissions: [USERS_READ, USERS_INVITE] });
    expect(await screen.findByRole("button", { name: "Invite user" })).toBeInTheDocument();
  });

  it("does not offer the invite form to someone who may not invite", async () => {
    renderRoute("/users", { permissions: [USERS_READ] });
    await screen.findByRole("table", { name: "Users" });
    expect(screen.queryByRole("button", { name: "Invite user" })).toBeNull();
  });

  it("filters by role and status from the URL, and leaves out values it does not know", async () => {
    const { router } = renderRoute("/users?role=OWNER&status=DEACTIVATED", { permissions: [USERS_READ] });
    await waitFor(() => expect(requests.length).toBeGreaterThan(0));
    expect(requests.at(-1)?.get("role")).toBe("OWNER");
    expect(requests.at(-1)?.get("status")).toBe("DEACTIVATED");

    await router.navigate({ to: "/users", search: { role: "BOGUS" } as never });
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("puts a chosen role and status in the URL, and the default status back out of it", async () => {
    const { router } = renderRoute("/users", { permissions: [USERS_READ] });
    const user = userEvent.setup();

    await user.click(within(await screen.findByRole("group", { name: "Role" })).getByRole("button", { name: "Owners" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ role: "OWNER" }));

    await user.click(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "Deactivated" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ role: "OWNER", status: "DEACTIVATED" }));

    await user.click(within(screen.getByRole("group", { name: "Status" })).getByRole("button", { name: "Active" }));
    await waitFor(() => expect(router.state.location.search).toEqual({ role: "OWNER" }));
  });

  it("searches as the user types, replacing the history entry, and starts again from the first page", async () => {
    const { router } = renderRoute("/users?pageIndex=1", { permissions: [USERS_READ] });

    const box = await screen.findByRole("searchbox", { name: "Search users" });
    const entries = router.history.length;

    await userEvent.type(box, "ada");

    await waitFor(() => expect(router.state.location.search).toEqual({ search: "ada" }));
    expect(router.history.length).toBe(entries);
  });

  it("puts a chosen sort in the URL", async () => {
    const { router } = renderRoute("/users", { permissions: [USERS_READ] });
    const table = await screen.findByRole("table", { name: "Users" });

    await userEvent.click(within(table).getByRole("button", { name: "Email" }));

    await waitFor(() => expect(router.state.location.search).toEqual({ sortBy: "EMAIL" }));
  });

  it("sends someone who may not read users to Home", async () => {
    const { router } = renderRoute("/users", { permissions: [] });
    expect(await screen.findByRole("heading", { name: /^Welcome/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
