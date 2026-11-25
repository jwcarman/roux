// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it } from "vitest";
import { pageOf, server, serverError } from "@jwcarman/roux-web/testing";
import { today } from "@jwcarman/roux-web/organization";
import { ITEMS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";
import { mondayOf } from "../../items/week";

const ITEMS = [
  {
    id: "i-1",
    title: "Draft the agenda",
    day: "2026-11-23",
    at: "10:30",
    done: false,
    assigneeNames: ["Ada Lovelace"],
    version: 0,
  },
  {
    id: "i-2",
    title: "Send the invitations",
    day: "2026-11-23",
    at: null,
    done: true,
    assigneeNames: ["Test User"],
    version: 1,
  },
  {
    id: "i-3",
    title: "Order the venue",
    day: "2026-11-27",
    at: null,
    done: false,
    assigneeNames: ["Grace Hopper"],
    version: 0,
  },
];

let requests: URLSearchParams[];
let answer: () => Response;

beforeEach(() => {
  requests = [];
  answer = () =>
    HttpResponse.json(pageOf(ITEMS, { pageIndex: 0, pageSize: 100 }));
  server.use(
    http.get("/api/items", ({ request }) => {
      requests.push(new URL(request.url).searchParams);
      return answer();
    }),
  );
});

const latest = () => Object.fromEntries(requests[requests.length - 1]);
const day = (label: string) => screen.getByRole("region", { name: label });

describe("/week", () => {
  it("shows the week Monday to Sunday, each item under its day, asking for that week only", async () => {
    renderRoute("/week?week=2026-11-25", { permissions: [ITEMS_READ] });

    expect(
      await screen.findByRole("heading", { name: "Nov 23 – Nov 29, 2026" }),
    ).toBeInTheDocument();
    await screen.findByRole("link", { name: "Draft the agenda" });
    expect(latest()).toEqual({
      from: "2026-11-23",
      to: "2026-11-29",
      pageSize: "100",
      sortBy: "DAY",
      sortDirection: "ASC",
    });
    const days = within(
      screen.getByRole("group", { name: "Days of the week" }),
    ).getAllByRole("region");
    expect(days.map((d) => d.getAttribute("aria-label"))).toEqual([
      "Monday, November 23",
      "Tuesday, November 24",
      "Wednesday, November 25",
      "Thursday, November 26",
      "Friday, November 27",
      "Saturday, November 28",
      "Sunday, November 29",
    ]);
    const monday = day("Monday, November 23");
    expect(
      within(monday).getByRole("link", { name: "Draft the agenda" }),
    ).toHaveAttribute("href", "/items/i-1");
    expect(within(monday).getByText("10:30")).toBeInTheDocument();
    expect(within(monday).getByText("All day")).toBeInTheDocument();
    const [open, done] = within(monday).getAllByRole("listitem");
    expect(within(open).queryByText("Done")).toBeNull();
    expect(within(done).getByText("Done")).toBeInTheDocument();
    expect(
      within(day("Friday, November 27")).getByRole("link", {
        name: "Order the venue",
      }),
    ).toBeInTheDocument();
    expect(
      within(day("Tuesday, November 24")).getByText("Nothing planned"),
    ).toBeInTheDocument();
    expect(screen.queryByText("Could not load the week")).toBeNull();
  });

  it("opens on this week, with today marked", async () => {
    renderRoute("/week", { permissions: [ITEMS_READ] });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(latest().from).toBe(mondayOf(today()));
    const grid = await screen.findByRole("group", { name: "Days of the week" });
    expect(screen.getByRole("button", { name: "This week" })).toBeDisabled();
    const marked = within(grid)
      .getAllByRole("region")
      .filter((d) => d.getAttribute("aria-current") === "date");
    expect(marked).toHaveLength(1);
    expect(within(grid).getAllByText("Today")).toHaveLength(1);
    expect(within(marked[0]).getByText("Today")).toBeInTheDocument();
  });

  it("moves a week back and forward, and back to this week, in the URL", async () => {
    const { router } = renderRoute("/week?week=2026-11-25", {
      permissions: [ITEMS_READ],
    });
    const user = userEvent.setup();
    await screen.findByRole("heading", { name: "Nov 23 – Nov 29, 2026" });

    await user.click(screen.getByRole("button", { name: "Next week" }));
    expect(
      await screen.findByRole("heading", { name: "Nov 30 – Dec 6, 2026" }),
    ).toBeInTheDocument();
    expect(router.state.location.search).toEqual({ week: "2026-11-30" });
    await waitFor(() => expect(latest().from).toBe("2026-11-30"));

    await user.click(screen.getByRole("button", { name: "Previous week" }));
    await user.click(screen.getByRole("button", { name: "Previous week" }));
    expect(
      await screen.findByRole("heading", { name: "Nov 16 – Nov 22, 2026" }),
    ).toBeInTheDocument();

    expect(screen.getByRole("button", { name: "This week" })).toBeEnabled();
    await user.click(screen.getByRole("button", { name: "This week" }));
    await waitFor(() => expect(router.state.location.search).toEqual({}));
  });

  it("shows only the caller's items when Mine is chosen", async () => {
    const { router } = renderRoute("/week?week=2026-11-25", {
      permissions: [ITEMS_READ],
    });
    const user = userEvent.setup();
    await screen.findByRole("link", { name: "Draft the agenda" });
    await user.click(screen.getByRole("button", { name: "Mine" }));
    await waitFor(() => expect(latest().assignee).toBe("me"));
    expect(router.state.location.search).toEqual({
      week: "2026-11-25",
      assignee: "me",
    });
    await user.click(screen.getByRole("button", { name: "Everyone" }));
    await waitFor(() => expect(latest().assignee).toBeUndefined());
  });

  it("drops a week that is not a day, and opens on this week", async () => {
    renderRoute("/week?week=soon", { permissions: [ITEMS_READ] });
    await waitFor(() => expect(requests).toHaveLength(1));
    expect(latest().from).toBe(mondayOf(today()));
  });

  it("says so when the week has more than one page holds", async () => {
    const first = pageOf(ITEMS, { pageIndex: 0, pageSize: 100 });
    answer = () =>
      HttpResponse.json({
        ...first,
        pagination: {
          ...first.pagination,
          totalElementCount: 140,
          totalPageCount: 2,
          hasNext: true,
        },
      });
    renderRoute("/week?week=2026-11-25", { permissions: [ITEMS_READ] });
    expect(
      await screen.findByText(
        "Showing the first 100 of 140 items: choose Mine, or see them all in Items.",
      ),
    ).toBeInTheDocument();
  });

  it("says so when the week cannot be loaded", async () => {
    answer = () => serverError();
    renderRoute("/week?week=2026-11-25", { permissions: [ITEMS_READ] });
    expect(
      await screen.findByText("Could not load the week"),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole("group", { name: "Days of the week" }),
    ).toBeNull();
  });

  it("sends someone who may not read items Home, without asking for the week", async () => {
    const { router } = renderRoute("/week", { permissions: [] });
    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(requests).toEqual([]);
  });
});
