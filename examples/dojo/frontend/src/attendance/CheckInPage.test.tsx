// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { formatIsoDate } from "@jwcarman/roux-web/dates";
import { toaster } from "@jwcarman/roux-web/feedback";
import { ATTENDANCE_RECORD, CLASSES_READ } from "../api";
import type { SchoolClass } from "../classes/classes";
import { invalidFields } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { queryKeys } from "../queryKeys";
import { markAttendance, type AttendanceRequest, type Attendee } from "./attendance";

const KARATE: SchoolClass = {
  id: "c1",
  name: "Tuesday Karate",
  weekday: "TUESDAY",
  startsAt: "17:00:00",
  endsAt: "18:00:00",
  instructorId: null,
  instructorName: null,
  version: 0,
};

const STAFF = { permissions: [CLASSES_READ, ATTENDANCE_RECORD] };

const PEOPLE: Attendee[] = [
  { studentId: "s1", firstName: "Ada", lastName: "Lovelace", present: false },
  { studentId: "s2", firstName: "Alan", lastName: "Turing", present: false },
  { studentId: "s3", firstName: "Grace", lastName: "Hopper", present: false },
];

/** A fake school: the class, and a roster whose marks the server keeps (and a test may change). */
function school(roster: Attendee[] = PEOPLE) {
  const marks = new Map(roster.map((person) => [person.studentId, person.present]));
  const sent: AttendanceRequest[] = [];
  const asked: string[] = [];
  const answer = (): Attendee[] => roster.map((person) => ({ ...person, present: marks.get(person.studentId) ?? false }));
  server.use(
    http.get("/api/classes/c1", () => HttpResponse.json(KARATE)),
    http.get("/api/classes/c1/check-in", ({ request }) => {
      asked.push(new URL(request.url).searchParams.get("date") ?? "");
      return HttpResponse.json(answer());
    }),
    http.put("/api/classes/c1/attendance", async ({ request }) => {
      const body = (await request.json()) as AttendanceRequest;
      sent.push(body);
      marks.set(body.studentId, body.present);
      return HttpResponse.json({ ...roster.find((person) => person.studentId === body.studentId), present: body.present });
    }),
  );
  return { marks, sent, asked };
}

function toggle(name: string) {
  return screen.findByRole("button", { name });
}

describe("CheckInPage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    // Tuesday, the day Tuesday Karate runs; only the clock's date is faked.
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 10, 17, 12));
  });

  afterEach(() => {
    vi.useRealTimers();
    act(() => toaster.remove());
  });

  it("defaults to the most recent day the class runs when it does not run today", async () => {
    vi.setSystemTime(new Date(2026, 10, 19, 12)); // the Thursday after
    const { asked } = school();
    renderRoute("/classes/c1/check-in", STAFF);

    await toggle("Ada Lovelace");

    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-17");
    expect(asked).toEqual(["2026-11-17"]);
  });

  it("defaults to a week back on the day before the class runs", async () => {
    vi.setSystemTime(new Date(2026, 10, 16, 12)); // the Monday before
    const { asked } = school();
    renderRoute("/classes/c1/check-in", STAFF);

    await toggle("Ada Lovelace");

    expect(screen.getByLabelText("Date")).toHaveValue("2026-11-10");
    expect(asked).toEqual(["2026-11-10"]);
  });

  it("lists every active student as a toggle, none present, for today unless the URL says otherwise", async () => {
    const { asked } = school();
    renderRoute("/classes/c1/check-in", STAFF);

    expect(await screen.findByRole("heading", { name: "Check in: Tuesday Karate" })).toBeInTheDocument();
    for (const name of ["Ada Lovelace", "Alan Turing", "Grace Hopper"]) {
      expect(await toggle(name)).toHaveAttribute("aria-pressed", "false");
    }
    expect(screen.getByLabelText("Date")).toHaveValue(formatIsoDate(new Date()));
    expect(asked).toEqual([formatIsoDate(new Date())]);
    expect(screen.getByRole("status")).toHaveTextContent("0 of 3 present");
  });

  it("opens on the date in the URL, and on today when that is not a real date", async () => {
    const { asked } = school();
    renderRoute("/classes/c1/check-in?date=2026-03-10", STAFF);

    await toggle("Ada Lovelace");
    expect(screen.getByLabelText("Date")).toHaveValue("2026-03-10");
    expect(asked).toEqual(["2026-03-10"]);
  });

  it("falls back to today for a date that is not a date", async () => {
    const { asked } = school();
    renderRoute("/classes/c1/check-in?date=2026-02-30", STAFF);

    await toggle("Ada Lovelace");
    expect(asked).toEqual([formatIsoDate(new Date())]);
  });

  it("marks present as soon as it is tapped, before the server answers, then shows the server's list", async () => {
    const { marks } = school();
    let release: () => void = () => undefined;
    const held = new Promise<void>((resolve) => (release = resolve));
    server.use(
      http.put("/api/classes/c1/attendance", async ({ request }) => {
        const body = (await request.json()) as AttendanceRequest;
        await held;
        marks.set(body.studentId, body.present);
        return HttpResponse.json({ ...PEOPLE[0], present: body.present });
      }),
    );
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();

    await user.click(await toggle("Ada Lovelace"));

    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "true");
    expect(marks.get("s1")).toBe(false);
    release();
    await waitFor(() => expect(marks.get("s1")).toBe(true));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 3 present"));
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "true");
  });

  it("tapping again undoes it", async () => {
    const { marks, sent } = school();
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();

    await user.click(await toggle("Ada Lovelace"));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 3 present"));
    await user.click(screen.getByRole("button", { name: "Ada Lovelace" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("0 of 3 present"));
    expect(sent.map((request) => request.present)).toEqual([true, false]);
    expect(marks.get("s1")).toBe(false);
    expect(sent[0]).toEqual({ studentId: "s1", date: formatIsoDate(new Date()), present: true });
  });

  it("a double tap sends present then not present, one after the other, and ends as the server has it", async () => {
    const { marks, sent } = school();
    const inFlight: string[] = [];
    let concurrent = 0;
    let most = 0;
    server.use(
      http.put("/api/classes/c1/attendance", async ({ request }) => {
        const body = (await request.json()) as AttendanceRequest;
        concurrent += 1;
        most = Math.max(most, concurrent);
        inFlight.push(`${body.present}`);
        await delay(30);
        sent.push(body);
        marks.set(body.studentId, body.present);
        concurrent -= 1;
        return HttpResponse.json({ ...PEOPLE[0], present: body.present });
      }),
    );
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    const ada = await toggle("Ada Lovelace");

    await user.click(ada);
    await user.click(ada);

    // each tap shows at once: the second one undoes the first
    expect(ada).toHaveAttribute("aria-pressed", "false");
    await waitFor(() => expect(sent.map((request) => request.present)).toEqual([true, false]));
    expect(most).toBe(1);
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("0 of 3 present"));
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "false");
    expect(marks.get("s1")).toBe(false);
  });

  it("two taps in the same instant, before the screen has shown the first, still undo each other", async () => {
    const { marks, sent } = school();
    renderRoute("/classes/c1/check-in", STAFF);
    const ada = await toggle("Ada Lovelace");

    fireEvent.click(ada);
    fireEvent.click(ada);

    await waitFor(() => expect(sent.map((request) => request.present)).toEqual([true, false]));
    await waitFor(() => expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "false"));
    expect(marks.get("s1")).toBe(false);
  });

  it("three taps in a row end present, whatever the server was slow about", async () => {
    const { marks } = school();
    server.use(
      http.put("/api/classes/c1/attendance", async ({ request }) => {
        const body = (await request.json()) as AttendanceRequest;
        await delay(20);
        marks.set(body.studentId, body.present);
        return HttpResponse.json({ ...PEOPLE[0], present: body.present });
      }),
    );
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    const ada = await toggle("Ada Lovelace");

    await user.click(ada);
    await user.click(ada);
    await user.click(ada);

    expect(ada).toHaveAttribute("aria-pressed", "true");
    await waitFor(() => expect(marks.get("s1")).toBe(true));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 3 present"));
    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows the server's truth when another device undid the mark meanwhile", async () => {
    const { marks } = school([{ ...PEOPLE[0], present: true }, PEOPLE[1], PEOPLE[2]]);
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    const ada = await toggle("Ada Lovelace");
    expect(ada).toHaveAttribute("aria-pressed", "true");

    // the other device marks Alan present; this one taps Grace
    marks.set("s2", true);
    await user.click(await toggle("Grace Hopper"));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("3 of 3 present"));
    expect(screen.getByRole("button", { name: "Alan Turing" })).toHaveAttribute("aria-pressed", "true");
  });

  it("puts a toggle back and says why when the server refuses it", async () => {
    school();
    server.use(
      http.put(
        "/api/classes/c1/attendance",
        () =>
          new HttpResponse(
            JSON.stringify({ type: "about:blank", title: "Conflict", status: 409, detail: "Ada Lovelace is not active" }),
            { status: 409, headers: { "Content-Type": "application/problem+json" } },
          ),
      ),
    );
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();

    await user.click(await toggle("Ada Lovelace"));

    expect(await screen.findByText("Ada Lovelace is not active")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Ada Lovelace" })).toHaveAttribute("aria-pressed", "false"));
  });

  it("filters the list in the browser as the user types, without asking the server", async () => {
    const { asked } = school();
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    await toggle("Ada Lovelace");

    await user.type(screen.getByLabelText("Search students"), "tur");

    expect(screen.getAllByRole("button", { pressed: false }).map((button) => button.textContent)).toContain("Alan Turing");
    expect(screen.queryByRole("button", { name: "Ada Lovelace" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Grace Hopper" })).not.toBeInTheDocument();
    expect(asked).toHaveLength(1);

    await user.clear(screen.getByLabelText("Search students"));
    await user.type(screen.getByLabelText("Search students"), "nobody");
    expect(await screen.findByText("No student matches “nobody”.")).toBeInTheDocument();
  });

  it("matches every word of the search against the whole name, ignoring case", async () => {
    school();
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    await toggle("Ada Lovelace");

    await user.type(screen.getByLabelText("Search students"), "LOVELACE ada");

    expect(screen.getByRole("button", { name: "Ada Lovelace" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Alan Turing" })).not.toBeInTheDocument();
  });

  it("keeps a mark made while the list is filtered, and the filter", async () => {
    const { marks } = school();
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    await toggle("Ada Lovelace");
    await user.type(screen.getByLabelText("Search students"), "turing");

    await user.click(screen.getByRole("button", { name: "Alan Turing" }));

    await waitFor(() => expect(marks.get("s2")).toBe(true));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("1 of 3 present"));
    expect(screen.queryByRole("button", { name: "Ada Lovelace" })).not.toBeInTheDocument();
  });

  it("catches up on another date: the picker asks the server for that date's marks", async () => {
    const { asked } = school();
    renderRoute("/classes/c1/check-in", STAFF);
    const user = userEvent.setup();
    await toggle("Ada Lovelace");

    fireEvent.change(screen.getByLabelText("Date"), { target: { value: "2026-03-03" } });

    await waitFor(() => expect(asked).toContain("2026-03-03"));
    await user.click(await toggle("Ada Lovelace"));
    await waitFor(() => expect(asked.filter((day) => day === "2026-03-03").length).toBeGreaterThan(1));
  });

  it("sends the chosen date with a mark", async () => {
    const { sent } = school();
    renderRoute("/classes/c1/check-in?date=2026-03-03", STAFF);
    const user = userEvent.setup();

    await user.click(await toggle("Ada Lovelace"));

    await waitFor(() => expect(sent).toEqual([{ studentId: "s1", date: "2026-03-03", present: true }]));
  });

  it("shows the server's word about a date the class does not run on, and no students", async () => {
    school();
    server.use(
      http.get("/api/classes/c1/check-in", () => invalidFields({ date: "Must be a Tuesday, when Tuesday Karate runs" })),
    );
    renderRoute("/classes/c1/check-in?date=2026-03-09", STAFF);

    expect(await screen.findByText("Must be a Tuesday, when Tuesday Karate runs")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ada Lovelace" })).not.toBeInTheDocument();
    expect(screen.getByLabelText("Date")).toHaveValue("2026-03-09");
  });

  it("says so when the list cannot be loaded for another reason", async () => {
    school();
    server.use(http.get("/api/classes/c1/check-in", () => new HttpResponse(null, { status: 500 })));
    renderRoute("/classes/c1/check-in", STAFF);

    expect(await screen.findByText("The students could not be loaded.")).toBeInTheDocument();
  });

  it("says so when there are no active students", async () => {
    school([]);
    renderRoute("/classes/c1/check-in", STAFF);

    expect(await screen.findByText("No active students.")).toBeInTheDocument();
  });

  it("sends someone who may not record attendance home", async () => {
    school();
    renderRoute("/classes/c1/check-in", { permissions: [CLASSES_READ] });

    expect(await screen.findByRole("heading", { name: "Home", level: 2 })).toBeInTheDocument();
  });

  it("shows not-found for a class that does not exist", async () => {
    server.use(
      http.get(
        "/api/classes/nothing",
        () =>
          new HttpResponse(JSON.stringify({ type: "about:blank", title: "Not Found", status: 404, detail: "No class nothing" }), {
            status: 404,
            headers: { "Content-Type": "application/problem+json" },
          }),
      ),
    );
    renderRoute("/classes/nothing/check-in", STAFF);

    expect(await screen.findByText("Class not found")).toBeInTheDocument();
  });
});

describe("markAttendance", () => {
  it("refreshes the check-in list and the student's page, and queues one student's marks", () => {
    const mutation = markAttendance("c1", "2026-03-10", "s1");

    expect(mutation.meta?.refreshes).toEqual([
      queryKeys.attendance.checkIn("c1", "2026-03-10"),
      queryKeys.students.detail("s1"),
    ]);
    expect(mutation.mutationKey).toEqual(queryKeys.attendance.mark("c1", "2026-03-10", "s1"));
    expect(mutation.scope?.id).toBe(JSON.stringify(queryKeys.attendance.mark("c1", "2026-03-10", "s1")));
    expect(markAttendance("c1", "2026-03-10", "s2").scope?.id).not.toBe(mutation.scope?.id);
  });

  it("sends the wanted state, so a repeat is the same request", async () => {
    const sent: unknown[] = [];
    server.use(
      http.put("/api/classes/c1/attendance", async ({ request }) => {
        sent.push(await request.json());
        return HttpResponse.json(PEOPLE[0]);
      }),
    );
    document.cookie = "XSRF-TOKEN=token";
    const mutation = markAttendance("c1", "2026-03-10", "s1");

    await mutation.mutationFn?.(true, { client: undefined!, meta: undefined });
    await mutation.mutationFn?.(true, { client: undefined!, meta: undefined });

    expect(sent).toEqual([
      { studentId: "s1", date: "2026-03-10", present: true },
      { studentId: "s1", date: "2026-03-10", present: true },
    ]);
  });
});
