// @vitest-environment jsdom
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { ATTENDANCE_RECORD, CLASSES_MANAGE, CLASSES_READ } from "../permissions.gen";
import { formatTime } from "@jwcarman/roux-web/dates";
import { invalidFields, stale } from "../testing/problems";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { queryKeys } from "../queryKeys";
import { classRequestSchema, createClass, removeClass, updateClass, WEEKDAYS, type SchoolClass } from "./classes";

const EARLY: SchoolClass = {
  id: "c1",
  name: "Early bird",
  weekday: "MONDAY",
  startsAt: "06:30:00",
  endsAt: "07:30:00",
  instructorId: null,
  instructorName: null,
  version: 0,
};
const KIDS: SchoolClass = {
  id: "c2",
  name: "Kids Karate",
  weekday: "MONDAY",
  startsAt: "17:00:00",
  endsAt: "18:00:00",
  instructorId: "i1",
  instructorName: "Ivy Instructor",
  version: 3,
};
const OPEN_MAT: SchoolClass = {
  id: "c3",
  name: "Open mat",
  weekday: "SUNDAY",
  startsAt: "10:00:00",
  endsAt: "12:00:00",
  instructorId: null,
  instructorName: null,
  version: 0,
};

const READ = { permissions: [CLASSES_READ] };
const MANAGE = { permissions: [CLASSES_READ, CLASSES_MANAGE] };

function serve(...classes: SchoolClass[]) {
  server.use(
    http.get("/api/classes", () => HttpResponse.json(classes)),
    http.get("/api/classes/instructors", () => HttpResponse.json([{ id: "i1", name: "Ivy Instructor" }])),
  );
}

describe("TimetablePage", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("shows a column for each day from Monday, each day's classes in the order the server gives", async () => {
    serve(EARLY, KIDS, OPEN_MAT);
    renderRoute("/timetable", READ);

    await screen.findByText("Kids Karate");
    const monday = screen.getByRole("region", { name: "Monday" });
    expect(within(monday).getAllByText(/Early bird|Kids Karate/).map((name) => name.textContent)).toEqual([
      "Early bird",
      "Kids Karate",
    ]);
    expect(within(monday).getByText(`${formatTime("17:00")} – ${formatTime("18:00")}`)).toBeInTheDocument();
    expect(within(monday).getByText("Ivy Instructor")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Sunday" })).getByText("Open mat")).toBeInTheDocument();
    expect(within(screen.getByRole("region", { name: "Tuesday" })).queryByText(/./, { selector: "p" })).toBeNull();
    const days = screen.getAllByRole("heading", { level: 3 }).map((heading) => heading.textContent);
    expect(days).toEqual(["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"]);
  });

  it("is read-only without classes.manage", async () => {
    serve(KIDS);
    renderRoute("/timetable", READ);

    await screen.findByText("Kids Karate");
    expect(screen.queryByRole("button", { name: "New class" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^(Edit|Remove)/ })).not.toBeInTheDocument();
  });

  it("links each class to its check-in only for whoever records attendance", async () => {
    serve(KIDS);
    renderRoute("/timetable", { permissions: [CLASSES_READ, ATTENDANCE_RECORD] });

    const link = await screen.findByRole("link", { name: "Check in Kids Karate" });
    expect(link).toHaveAttribute("href", "/classes/c2/check-in");
    expect(screen.queryByRole("button", { name: /^(Edit|Remove)/ })).not.toBeInTheDocument();
  });

  it("offers no check-in to a read-only member", async () => {
    serve(KIDS);
    renderRoute("/timetable", READ);

    await screen.findByText("Kids Karate");
    expect(screen.queryByRole("link", { name: /^Check in/ })).not.toBeInTheDocument();
  });

  it("says so when there are no classes", async () => {
    serve();
    renderRoute("/timetable", READ);

    expect(await screen.findByText("No classes yet.")).toBeInTheDocument();
  });

  it("says so when the timetable cannot be loaded", async () => {
    server.use(http.get("/api/classes", () => new HttpResponse(null, { status: 500 })));
    renderRoute("/timetable", READ);

    expect(await screen.findByText("The timetable could not be loaded.")).toBeInTheDocument();
  });

  it("adds a class: the times as typed, no instructor as null, then the timetable refreshes", async () => {
    let sent: unknown;
    let classes: SchoolClass[] = [];
    serve();
    server.use(
      http.get("/api/classes", () => HttpResponse.json(classes)),
      http.post("/api/classes", async ({ request }) => {
        sent = await request.json();
        classes = [KIDS];
        return HttpResponse.json(KIDS, { status: 201 });
      }),
    );
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.type(within(dialog).getByLabelText(/^Name/), " Kids Karate ");
    await user.selectOptions(within(dialog).getByLabelText(/^Day/), "MONDAY");
    await user.type(within(dialog).getByLabelText(/^Starts/), "17:00");
    await user.type(within(dialog).getByLabelText(/^Ends/), "18:00");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Kids Karate was saved");
    expect(sent).toEqual({
      name: "Kids Karate",
      weekday: "MONDAY",
      startsAt: "17:00",
      endsAt: "18:00",
      instructorId: null,
    });
    expect(await within(screen.getByRole("region", { name: "Monday" })).findByText("Ivy Instructor")).toBeInTheDocument();
  });

  it("offers the instructors and sends the one chosen", async () => {
    let sent: unknown;
    serve();
    server.use(
      http.post("/api/classes", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json(KIDS, { status: 201 });
      }),
    );
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Kids Karate");
    await user.selectOptions(within(dialog).getByLabelText(/^Day/), "MONDAY");
    await user.type(within(dialog).getByLabelText(/^Starts/), "17:00");
    await user.type(within(dialog).getByLabelText(/^Ends/), "18:00");
    await user.selectOptions(await within(dialog).findByLabelText(/^Instructor/), "i1");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    await screen.findByRole("status");
    expect(sent).toMatchObject({ instructorId: "i1" });
  });

  it("refuses a missing day and missing times before anything is sent, in the server's words", async () => {
    serve();
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must not be blank")).toBeInTheDocument();
    expect(within(dialog).getAllByText("Must not be empty")).toHaveLength(3);
  });

  it("refuses an end that is not after the start, under Ends", async () => {
    serve();
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Kids Karate");
    await user.selectOptions(within(dialog).getByLabelText(/^Day/), "MONDAY");
    await user.type(within(dialog).getByLabelText(/^Starts/), "17:00");
    await user.type(within(dialog).getByLabelText(/^Ends/), "17:00");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must be after the start time")).toBeInTheDocument();
  });

  it("shows the server's refusal of the instructor under Instructor", async () => {
    serve();
    server.use(http.post("/api/classes", () => invalidFields({ instructorId: "Must be an owner or an instructor" })));
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "New class" }));
    const dialog = await screen.findByRole("dialog", { name: "New class" });
    await user.type(within(dialog).getByLabelText(/^Name/), "Kids Karate");
    await user.selectOptions(within(dialog).getByLabelText(/^Day/), "MONDAY");
    await user.type(within(dialog).getByLabelText(/^Starts/), "17:00");
    await user.type(within(dialog).getByLabelText(/^Ends/), "18:00");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await within(dialog).findByText("Must be an owner or an instructor")).toBeInTheDocument();
  });

  it("edits a class at the version shown, starting from its values", async () => {
    let sent: unknown;
    serve(KIDS);
    server.use(
      http.put("/api/classes/c2", async ({ request }) => {
        sent = await request.json();
        return HttpResponse.json({ ...KIDS, name: "Kids Kata", version: 4 });
      }),
    );
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit Kids Karate" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Kids Karate" });
    // the server writes 17:00:00; the time input holds 17:00
    expect(within(dialog).getByLabelText(/^Starts/)).toHaveValue("17:00");
    expect(within(dialog).getByLabelText(/^Day/)).toHaveValue("MONDAY");
    const name = within(dialog).getByLabelText(/^Name/);
    await user.clear(name);
    await user.type(name, "Kids Kata");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Kids Kata was saved");
    expect(sent).toEqual({
      name: "Kids Kata",
      weekday: "MONDAY",
      startsAt: "17:00",
      endsAt: "18:00",
      instructorId: "i1",
      version: 3,
    });
  });

  it("tells the user when someone else changed the class meanwhile", async () => {
    serve(KIDS);
    server.use(http.put("/api/classes/c2", () => stale()));
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Edit Kids Karate" }));
    const dialog = await screen.findByRole("dialog", { name: "Edit Kids Karate" });
    await user.type(within(dialog).getByLabelText(/^Name/), "!");
    await user.click(within(dialog).getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This record changed since you loaded it")).toBeInTheDocument();
  });

  it("asks before removing, then removes", async () => {
    let removed = false;
    server.use(
      http.get("/api/classes", () => HttpResponse.json(removed ? [] : [KIDS])),
      http.get("/api/classes/instructors", () => HttpResponse.json([])),
      http.delete("/api/classes/c2", () => {
        removed = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove Kids Karate" }));
    const confirm = await screen.findByRole("alertdialog", { name: "Remove Kids Karate?" });
    expect(removed).toBe(false);
    await user.click(within(confirm).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("No classes yet.")).toBeInTheDocument();
    expect(await screen.findByRole("status")).toHaveTextContent("Kids Karate was removed");
  });

  it("shows why a class cannot be removed", async () => {
    serve(KIDS);
    server.use(
      http.delete(
        "/api/classes/c2",
        () =>
          new HttpResponse(
            JSON.stringify({ type: "about:blank", title: "Conflict", status: 409, detail: "Students have attended Kids Karate" }),
            { status: 409, headers: { "Content-Type": "application/problem+json" } },
          ),
      ),
    );
    renderRoute("/timetable", MANAGE);
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Remove Kids Karate" }));
    await user.click(within(await screen.findByRole("alertdialog")).getByRole("button", { name: "Remove" }));

    expect(await screen.findByText("Students have attended Kids Karate")).toBeInTheDocument();
    expect(screen.getByText("Kids Karate")).toBeInTheDocument();
  });
});

describe("the classes module", () => {
  it("names every weekday of java.time.DayOfWeek, Monday first", () => {
    expect(WEEKDAYS).toEqual(["MONDAY", "TUESDAY", "WEDNESDAY", "THURSDAY", "FRIDAY", "SATURDAY", "SUNDAY"]);
  });

  it("refuses a time that is not HH:mm, in the server's words", () => {
    const parsed = classRequestSchema.safeParse({
      name: "Kids",
      weekday: "MONDAY",
      startsAt: "6pm",
      endsAt: "18:00",
      instructorId: "",
    });
    expect(parsed.success).toBe(false);
    expect(parsed.error?.issues.map((issue) => issue.message)).toContain("Is not in the expected format");
  });

  it("refuses a class that ends when it starts or before, on the end, in the server's words", () => {
    for (const endsAt of ["17:00", "16:59"]) {
      const parsed = classRequestSchema.safeParse({
        name: "Kids",
        weekday: "MONDAY",
        startsAt: "17:00",
        endsAt,
        instructorId: "",
      });
      expect(parsed.error?.issues).toMatchObject([{ path: ["endsAt"], message: "Must be after the start time" }]);
    }
  });

  it("sends no instructor as null", () => {
    const parsed = classRequestSchema.parse({
      name: "Kids",
      weekday: "MONDAY",
      startsAt: "17:00",
      endsAt: "18:00",
      instructorId: "",
    });
    expect(parsed.instructorId).toBeNull();
  });

  it("each mutation refreshes the timetable", () => {
    for (const mutation of [createClass, updateClass("c1", 0), removeClass]) {
      expect(mutation.meta?.refreshes).toContainEqual(queryKeys.classes.lists());
    }
  });
});
