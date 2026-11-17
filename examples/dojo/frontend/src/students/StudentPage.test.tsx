// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { PROMOTIONS_MANAGE, STUDENTS_MANAGE, STUDENTS_READ } from "../api";
import type { Rank } from "../ranks/ranks";
import { todayIso } from "../shell/dates";
import { invalidFields } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import type { StudentDetail } from "./students";

const WHITE: Rank = { id: "r1", name: "White", colour: "WHITE", position: 1, version: 0 };
const YELLOW: Rank = { id: "r2", name: "Yellow", colour: "YELLOW", position: 2, version: 0 };

const ADA: StudentDetail = {
  id: "s1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: "ada@example.org",
  phone: null,
  birthDate: "1990-12-10",
  startDate: "2026-02-01",
  status: "ACTIVE",
  currentRank: YELLOW,
  version: 2,
  promotions: [
    { id: "p2", rank: YELLOW, date: "2026-03-10" },
    { id: "p1", rank: WHITE, date: "2026-02-01" },
  ],
};

/** `/api/ranks`, and `/api/students/s1` answering `student` (which a test may change). */
function serve(student: () => StudentDetail = () => ADA) {
  server.use(
    http.get("/api/ranks", () => HttpResponse.json([WHITE, YELLOW])),
    http.get("/api/students/s1", () => HttpResponse.json(student())),
  );
}

const READ = { permissions: [STUDENTS_READ] };
const PROMOTE = { permissions: [STUDENTS_READ, PROMOTIONS_MANAGE] };

describe("StudentPage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("shows the student, the current rank and the promotions newest first, read-only without manage rights", async () => {
    serve();
    renderRoute("/students/s1", READ);

    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.getByText("ada@example.org")).toBeInTheDocument();
    expect(screen.getByText("Current rank").nextElementSibling).toHaveTextContent("Yellow");
    const rows = within(screen.getByRole("table", { name: "Promotions" })).getAllByRole("row");
    expect(rows[1]).toHaveTextContent("Yellow");
    expect(rows[2]).toHaveTextContent("White");
    expect(screen.queryByRole("button", { name: "Promote" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Remove/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Edit/ })).not.toBeInTheDocument();
  });

  it("says so when the student has not been promoted", async () => {
    serve(() => ({ ...ADA, currentRank: null, promotions: [] }));
    renderRoute("/students/s1", READ);

    expect(await screen.findByText("Not promoted yet")).toBeInTheDocument();
    expect(screen.getByText("No promotions yet.")).toBeInTheDocument();
  });

  it("offers editing to someone who manages students", async () => {
    serve();
    renderRoute("/students/s1", { permissions: [STUDENTS_READ, STUDENTS_MANAGE] });

    expect(await screen.findByRole("button", { name: "Edit Ada Lovelace" })).toBeInTheDocument();
  });

  it("promotes to a rank, today by default, and shows the new current rank", async () => {
    let student = ADA;
    let sent: unknown;
    serve(() => student);
    server.use(
      http.post("/api/students/s1/promotions", async ({ request }) => {
        sent = await request.json();
        student = {
          ...ADA,
          currentRank: WHITE,
          promotions: [{ id: "p3", rank: WHITE, date: todayIso() }, ...ADA.promotions],
        };
        return HttpResponse.json(student, { status: 201 });
      }),
    );
    renderRoute("/students/s1", PROMOTE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Promote" }));
    const dialog = await screen.findByRole("dialog", { name: "Promote Ada Lovelace" });
    expect(within(dialog).getByLabelText(/^Date/)).toHaveValue(todayIso());
    await user.selectOptions(await within(dialog).findByLabelText(/^Rank/), "r1");
    await user.click(within(dialog).getByRole("button", { name: "Promote" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Ada Lovelace was promoted");
    expect(sent).toEqual({ rankId: "r1", date: todayIso() });
    await waitFor(() => expect(screen.getByText("Current rank").nextElementSibling).toHaveTextContent("White"));
  });

  it("refuses a future date in the server's words before anything is sent", async () => {
    serve();
    renderRoute("/students/s1", PROMOTE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Promote" }));
    const dialog = await screen.findByRole("dialog", { name: "Promote Ada Lovelace" });
    await user.selectOptions(await within(dialog).findByLabelText(/^Rank/), "r1");
    const date = within(dialog).getByLabelText(/^Date/);
    await user.clear(date);
    await user.type(date, "2999-01-01");
    await user.click(within(dialog).getByRole("button", { name: "Promote" }));

    expect(await within(dialog).findByText("Must not be in the future")).toBeInTheDocument();
  });

  it("shows the server's refusal of the rank under the Rank field", async () => {
    serve();
    server.use(http.post("/api/students/s1/promotions", () => invalidFields({ rankId: "No such rank" })));
    renderRoute("/students/s1", PROMOTE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Promote" }));
    const dialog = await screen.findByRole("dialog", { name: "Promote Ada Lovelace" });
    await user.selectOptions(await within(dialog).findByLabelText(/^Rank/), "r1");
    await user.click(within(dialog).getByRole("button", { name: "Promote" }));

    expect(await within(dialog).findByText("No such rank")).toBeInTheDocument();
  });

  it("asks before taking a promotion back, then removes it", async () => {
    let student = ADA;
    let removed = false;
    serve(() => student);
    server.use(
      http.delete("/api/students/s1/promotions/p2", () => {
        removed = true;
        student = { ...ADA, currentRank: WHITE, promotions: [ADA.promotions[1]] };
        return HttpResponse.json(student);
      }),
    );
    renderRoute("/students/s1", PROMOTE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: /^Remove the promotion to Yellow/ }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove the promotion to Yellow?" });
    expect(removed).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(await screen.findByRole("status")).toHaveTextContent("The promotion to Yellow was removed");
    await waitFor(() => expect(screen.getByText("Current rank").nextElementSibling).toHaveTextContent("White"));
  });

  it("shows not-found for a student that does not exist", async () => {
    server.use(
      http.get(
        "/api/students/nobody",
        () =>
          new HttpResponse(JSON.stringify({ type: "about:blank", title: "Not Found", status: 404, detail: "No student nobody" }), {
            status: 404,
            headers: { "Content-Type": "application/problem+json" },
          }),
      ),
    );
    renderRoute("/students/nobody", READ);

    expect(await screen.findByText("Student not found")).toBeInTheDocument();
  });
});
