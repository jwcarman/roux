// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { ATTENDANCE_READ, PROMOTIONS_MANAGE, STUDENTS_READ } from "../permissions.gen";
import type { Rank } from "../ranks/ranks";
import { formatDate } from "@jwcarman/roux-web/dates";
import { pageOf } from "../testing/fakeServer";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { queryKeys } from "../queryKeys";
import { promoteStudent, removePromotion, type StudentDetail } from "../students/students";
import type { SincePromotion, StudentAttendance } from "./attendance";

const WHITE: Rank = { id: "r1", name: "White", colour: "WHITE", position: 1, version: 0 };

const ADA: StudentDetail = {
  id: "s1",
  firstName: "Ada",
  lastName: "Lovelace",
  email: null,
  phone: null,
  birthDate: null,
  startDate: "2026-02-01",
  status: "ACTIVE",
  currentRank: null,
  version: 0,
  promotions: [],
};

function attended(count: number): StudentAttendance[] {
  return Array.from({ length: count }, (_, i) => ({
    id: `a${i + 1}`,
    date: `2026-03-${String(30 - i).padStart(2, "0")}`,
    classId: "c1",
    className: i % 2 === 0 ? "Kids Karate" : "Adults",
  }));
}

/** The student's page, attendance and count; `since` may change between answers. */
function serve(rows: StudentAttendance[], since: () => SincePromotion = () => ({ classes: rows.length, promotedOn: null })) {
  const asked: number[] = [];
  server.use(
    http.get("/api/students/s1", () => HttpResponse.json(ADA)),
    http.get("/api/ranks", () => HttpResponse.json([WHITE])),
    http.get("/api/students/s1/attendance", ({ request }) => {
      const url = new URL(request.url);
      const pageIndex = Number(url.searchParams.get("pageIndex") ?? 0);
      asked.push(pageIndex);
      return HttpResponse.json(pageOf(rows, { pageIndex, pageSize: Number(url.searchParams.get("pageSize") ?? 20) }));
    }),
    http.get("/api/students/s1/attendance/since-promotion", () => HttpResponse.json(since())),
  );
  return { asked };
}

const READ = { permissions: [STUDENTS_READ, ATTENDANCE_READ] };

describe("a student's attendance", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("lists the classes attended, newest first as the server gives them, with the class and the date", async () => {
    serve(attended(3), () => ({ classes: 3, promotedOn: null }));
    renderRoute("/students/s1", READ);

    const list = await screen.findByRole("list", { name: "Attendance" });
    const items = await within(list).findAllByRole("listitem");
    expect(items).toHaveLength(3);
    expect(items[0]).toHaveTextContent("Kids Karate");
    expect(items[0]).toHaveTextContent(formatDate("2026-03-30"));
    expect(items[1]).toHaveTextContent("Adults");
  });

  it("asks for the next page when there is one and shows it after the first", async () => {
    const { asked } = serve(attended(25));
    renderRoute("/students/s1", READ);
    const user = userEvent.setup();

    const list = await screen.findByRole("list", { name: "Attendance" });
    expect(await within(list).findAllByRole("listitem")).toHaveLength(20);
    await user.click(await screen.findByRole("button", { name: "Show earlier classes" }));

    await waitFor(() => expect(within(screen.getByRole("list", { name: "Attendance" })).getAllByRole("listitem")).toHaveLength(25));
    expect(asked).toEqual([0, 1]);
  });

  it("says so when nothing was attended yet", async () => {
    serve([]);
    renderRoute("/students/s1", READ);

    expect(await screen.findByText("No classes attended yet.")).toBeInTheDocument();
    expect(await screen.findByText("Classes since last promotion")).toBeInTheDocument();
  });

  it("shows the classes since the last promotion", async () => {
    serve(attended(5), () => ({ classes: 2, promotedOn: "2026-03-29" }));
    renderRoute("/students/s1", READ);

    const label = await screen.findByText("Classes since last promotion");
    await waitFor(() => expect(label.nextElementSibling).toHaveTextContent(/^2$/));
  });

  it("says that all the classes count when the student was never promoted", async () => {
    serve(attended(4), () => ({ classes: 4, promotedOn: null }));
    renderRoute("/students/s1", READ);

    const label = await screen.findByText("Classes since last promotion");
    await waitFor(() => expect(label.nextElementSibling).toHaveTextContent("4 (all, not promoted yet)"));
  });

  it("brings the count up to date after a promotion", async () => {
    let since: SincePromotion = { classes: 4, promotedOn: null };
    serve(attended(4), () => since);
    server.use(
      http.post("/api/students/s1/promotions", () => {
        since = { classes: 0, promotedOn: "2026-03-30" };
        return HttpResponse.json(ADA, { status: 201 });
      }),
    );
    renderRoute("/students/s1", { permissions: [STUDENTS_READ, ATTENDANCE_READ, PROMOTIONS_MANAGE] });
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Promote" }));
    const dialog = await screen.findByRole("dialog", { name: "Promote Ada Lovelace" });
    await user.selectOptions(await within(dialog).findByLabelText(/^Rank/), "r1");
    await user.click(within(dialog).getByRole("button", { name: "Promote" }));

    await waitFor(() =>
      expect(screen.getByText("Classes since last promotion").nextElementSibling).toHaveTextContent(/^0$/),
    );
  });

  it("is not shown, and not asked for, without attendance.read", async () => {
    server.use(
      http.get("/api/students/s1", () => HttpResponse.json(ADA)),
      http.get("/api/ranks", () => HttpResponse.json([WHITE])),
    );
    renderRoute("/students/s1", { permissions: [STUDENTS_READ] });

    expect(await screen.findByRole("heading", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.queryByText("Classes since last promotion")).not.toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Attendance" })).not.toBeInTheDocument();
  });

  it("says so when the attendance cannot be loaded", async () => {
    serve([]);
    server.use(http.get("/api/students/s1/attendance", () => new HttpResponse(null, { status: 500 })));
    renderRoute("/students/s1", READ);

    expect(await screen.findByText("The attendance could not be loaded.")).toBeInTheDocument();
  });
});

describe("what refreshes a student's attendance", () => {
  it("a promotion or its removal refreshes the student's page, which holds the count and the history", () => {
    const refreshes = [promoteStudent("s1"), removePromotion("s1")].map((mutation) => mutation.meta?.refreshes);

    for (const keys of refreshes) {
      expect(keys).toContainEqual(queryKeys.students.detail("s1"));
    }
    const detail = queryKeys.students.detail("s1");
    expect(queryKeys.students.attendance("s1").slice(0, detail.length)).toEqual(detail);
    expect(queryKeys.students.sincePromotion("s1").slice(0, detail.length)).toEqual(detail);
  });
});
