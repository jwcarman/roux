// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { STUDENTS_MANAGE, STUDENTS_READ } from "../api";
import type { Rank } from "../ranks/ranks";
import { pageOf } from "../testing/fakeServer";
import { invalidFields } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { todayIso } from "../shell/dates";
import type { Student } from "./students";

const WHITE: Rank = { id: "r1", name: "White", colour: "WHITE", position: 1, version: 0 };
const YELLOW: Rank = { id: "r2", name: "Yellow", colour: "YELLOW", position: 2, version: 0 };

const ADA: Student = {
  id: "s1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.org",
  phone: null,
  birthDate: null,
  startDate: "2026-02-01",
  status: "ACTIVE",
  currentRank: YELLOW,
  version: 0,
};
const ALAN: Student = {
  ...ADA,
  id: "s2",
  firstName: "Alan",
  lastName: "Turing",
  email: null,
  startDate: "2026-01-01",
  currentRank: null,
};

/** `/api/ranks` and `/api/students` (which serves `rows`), recording each list request's query string. */
function endpoints(rows: Student[]) {
  const queries: string[] = [];
  server.use(
    http.get("/api/ranks", () => HttpResponse.json([WHITE, YELLOW])),
    http.get("/api/students", ({ request }) => {
      queries.push(new URL(request.url).search);
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
  );
  return queries;
}

const READ = { permissions: [STUDENTS_READ] };
const MANAGE = { permissions: [STUDENTS_READ, STUDENTS_MANAGE] };

describe("StudentsPage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("lists the students with their current rank, or a dash, read-only without students.manage", async () => {
    endpoints([ADA, ALAN]);
    renderRoute("/students", READ);

    const table = await screen.findByRole("table", { name: "Students" });
    expect(await within(table).findByRole("row", { name: /Ada Lovelace/ })).toHaveTextContent("Yellow");
    expect(within(table).getByRole("row", { name: /Alan Turing/ })).toHaveTextContent("—");
    expect(within(table).getByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/students/s1");
    expect(screen.queryByRole("button", { name: "New student" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("searches, and keeps the search in the URL", async () => {
    const queries = endpoints([ADA]);
    const { router } = renderRoute("/students", READ);
    await screen.findByRole("table", { name: "Students" });

    await userEvent.setup().type(screen.getByRole("searchbox", { name: "Search students" }), "love");

    await screen.findByText("Ada Lovelace");
    await waitFor(() => expect(queries.at(-1)).toContain("search=love"));
    expect(router.state.location.search).toMatchObject({ search: "love" });
  });

  it("filters by status and by current rank from the chips", async () => {
    const queries = endpoints([ADA]);
    const { router } = renderRoute("/students", READ);
    await screen.findByText("Ada Lovelace");
    const user = userEvent.setup();

    await user.click(screen.getByRole("button", { name: "Inactive", pressed: false }));
    await waitFor(() => expect(queries.at(-1)).toContain("status=INACTIVE"));
    expect(router.state.location.search).toMatchObject({ status: "INACTIVE" });

    await user.click(screen.getByRole("button", { name: "Yellow", pressed: false }));
    await waitFor(() => expect(queries.at(-1)).toContain("rankId=r2"));
    expect(router.state.location.search).toMatchObject({ status: "INACTIVE", rankId: "r2" });
  });

  it("sorts by rank from the header", async () => {
    const queries = endpoints([ADA]);
    renderRoute("/students", READ);
    await screen.findByText("Ada Lovelace");

    await userEvent.setup().click(screen.getByRole("button", { name: /Rank/ }));

    await waitFor(() => expect(queries.at(-1)).toContain("sortBy=RANK"));
  });

  it("starts a new student's start date at today", async () => {
    endpoints([]);
    renderRoute("/students", MANAGE);

    await userEvent.setup().click(await screen.findByRole("button", { name: "New student" }));

    const dialog = await screen.findByRole("dialog", { name: "New student" });
    expect(within(dialog).getByLabelText(/^Start date/)).toHaveValue(todayIso());
  });

  it("shows the server's refusal of an email under the Email field", async () => {
    endpoints([ADA]);
    server.use(http.post("/api/students", () => invalidFields({ email: "Must be a valid email address" })));
    renderRoute("/students", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New student" }));
    const dialog = await screen.findByRole("dialog", { name: "New student" });
    await user.type(within(dialog).getByLabelText(/^First name/), "Grace");
    await user.type(within(dialog).getByLabelText(/^Last name/), "Hopper");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must be a valid email address")).toBeInTheDocument();
  });

  it("refuses a date of birth in the future, in the server's words, before anything is sent", async () => {
    endpoints([ADA]);
    renderRoute("/students", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New student" }));
    const dialog = await screen.findByRole("dialog", { name: "New student" });
    await user.type(within(dialog).getByLabelText(/^First name/), "Grace");
    await user.type(within(dialog).getByLabelText(/^Last name/), "Hopper");
    await user.type(within(dialog).getByLabelText(/^Date of birth/), "2999-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must not be in the future")).toBeInTheDocument();
  });

  it("edits a student at the version shown", async () => {
    endpoints([{ ...ADA, version: 3 }]);
    let sent: unknown;
    server.use(
      http.put("/api/students/s1", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...ADA, lastName: "King", version: 4 });
      }),
    );
    renderRoute("/students", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit Ada Lovelace" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Ada Lovelace" });
    const last = within(dialog).getByLabelText(/^Last name/);
    await user.clear(last);
    await user.type(last, "King");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ada King was saved");
    expect(sent).toMatchObject({ firstName: "Ada", lastName: "King", email: "ada@example.org", phone: null, version: 3 });
  });

  it("asks before deactivating, then deactivates", async () => {
    let deactivated = false;
    endpoints([ADA]);
    server.use(
      http.post("/api/students/s1/deactivate", () => {
        deactivated = true;
        return HttpResponse.json({ ...ADA, status: "INACTIVE" });
      }),
    );
    renderRoute("/students", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Deactivate Ada Lovelace" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Deactivate Ada Lovelace?" });
    expect(deactivated).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ada Lovelace was deactivated");
    expect(deactivated).toBe(true);
  });

  it("offers Reactivate for an inactive student, with no question", async () => {
    endpoints([{ ...ADA, status: "INACTIVE" }]);
    server.use(http.post("/api/students/s1/reactivate", () => HttpResponse.json(ADA)));
    renderRoute("/students?status=INACTIVE", MANAGE);

    await userEvent.setup().click(await screen.findByRole("button", { name: "Reactivate Ada Lovelace" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ada Lovelace was reactivated");
  });
});
