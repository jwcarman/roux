import { expect, test, type Page } from "@playwright/test";
import { invite, openDialog, ownerEmail, ownerName, signInByLink, signedInThrough } from "./helpers";

// One school for the whole file: the tests run in order and each builds on the last.
test.describe.configure({ mode: "serial" });

const tag = `cls${Date.now().toString(36)}`;
const instructorEmail = `ivy.${tag}@dojo.test`;
const memberEmail = `mo.${tag}@dojo.test`;

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];

/** Dates as the browser's date inputs write them, in the browser's (this machine's) time zone. */
function isoDate(date: Date): string {
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${date.getFullYear()}-${month}-${day}`;
}

function daysFromToday(days: number): Date {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date;
}

const today = daysFromToday(0);
const lastWeek = daysFromToday(-7);
const promotedOn = daysFromToday(-3);
/** The weekday check-in is for: the class runs today, so today is a day it can be checked in for. */
const todayName = WEEKDAYS[today.getDay()];
const otherDayName = WEEKDAYS[(today.getDay() + 3) % 7];

const kids = `Kids ${tag}`;
const adults = `Adults ${tag}`;
const doomed = `Doomed ${tag}`;
const ada = { first: "Ada", last: `Lovelace ${tag}` };
const alan = { first: "Alan", last: `Turing ${tag}` };
const rank = `Rank ${tag}`;
const adaName = `${ada.first} ${ada.last}`;
const alanName = `${alan.first} ${alan.last}`;

function nav(page: Page, place: string) {
  return page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: place });
}

async function newClass(
  page: Page,
  details: { name: string; day: string; starts: string; ends: string; instructor?: string },
) {
  const dialog = await openDialog(page, "New class", "New class");
  await dialog.getByLabel("Name").fill(details.name);
  await dialog.getByLabel("Day").selectOption({ label: details.day });
  await dialog.getByLabel("Starts").fill(details.starts);
  await dialog.getByLabel("Ends").fill(details.ends);
  if (details.instructor) {
    await dialog.getByLabel("Instructor").selectOption({ label: details.instructor });
  }
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${details.name} was saved` })).toBeVisible();
  await expect(dialog).toBeHidden();
}

/**
 * What the server itself holds for the class whose check-in is open in `page`, on `date`, by
 * student name. Taps queue in the browser, one request after another: read this before leaving the
 * page, or a reload cuts the queue short.
 */
async function serverMarks(page: Page, date: Date): Promise<Record<string, boolean>> {
  const classId = new URL(page.url()).pathname.split("/")[2];
  return page.evaluate(
    async ({ classId, day }) => {
      const response = await fetch(`/api/classes/${classId}/check-in?date=${day}`, { credentials: "same-origin" });
      const people = (await response.json()) as { firstName: string; lastName: string; present: boolean }[];
      return Object.fromEntries(people.map((person) => [`${person.firstName} ${person.lastName}`, person.present]));
    },
    { classId, day: isoDate(date) },
  );
}

/** Counts the answers to attendance marks `page` has received, so a test can wait for a queue of taps to drain. */
function countMarkAnswers(page: Page): () => number {
  let answered = 0;
  page.on("response", (response) => {
    if (response.request().method() === "PUT" && response.url().endsWith("/attendance")) {
      answered += 1;
    }
  });
  return () => answered;
}

/** The toggle for a student on the check-in page. */
function toggle(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

test("the owner builds a timetable: adds, edits and removes classes", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await nav(page, "Timetable").click();
  await expect(page.getByRole("heading", { name: "Timetable", level: 2 })).toBeVisible();

  await newClass(page, { name: kids, day: todayName, starts: "17:00", ends: "18:00", instructor: ownerName });
  await newClass(page, { name: adults, day: otherDayName, starts: "19:00", ends: "20:00" });
  await newClass(page, { name: doomed, day: otherDayName, starts: "06:00", ends: "07:00" });

  // each class is in its own day's column, with its instructor
  const todaysColumn = page.getByRole("region", { name: todayName, exact: true });
  await expect(todaysColumn.getByText(kids)).toBeVisible();
  await expect(todaysColumn.getByText(ownerName)).toBeVisible();
  const otherColumn = page.getByRole("region", { name: otherDayName, exact: true });
  await expect(otherColumn.getByText(adults)).toBeVisible();
  // a day's classes run by start time: the 06:00 one is above the 19:00 one
  const names = await otherColumn.getByText(new RegExp(`(${adults}|${doomed})`)).allTextContents();
  expect(names).toEqual([doomed, adults]);

  // an end that is not after the start is refused under Ends, in the server's words
  const dialog = await openDialog(page, `Edit ${adults}`, `Edit ${adults}`);
  await dialog.getByLabel("Ends").fill("18:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(dialog.getByText("Must be after the start time")).toBeVisible();
  await dialog.getByLabel("Ends").fill("20:30");
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${adults} was saved` })).toBeVisible();
  await expect(dialog).toBeHidden();

  // a class with no attendance is removed after asking
  await page.getByRole("button", { name: `Remove ${doomed}`, exact: true }).click();
  await page.getByRole("alertdialog", { name: `Remove ${doomed}?` }).getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${doomed} was removed` })).toBeVisible();
  await expect(page.getByText(doomed)).toHaveCount(0);

  // the timetable is the server's: it survives a reload
  await page.reload();
  await expect(page.getByRole("region", { name: todayName, exact: true }).getByText(kids)).toBeVisible();
  await expect(page.getByText(doomed)).toHaveCount(0);

  // a rank to promote to, taken away again at the end so the ranks page is as other specs expect
  await nav(page, "Ranks").click();
  const rankDialog = await openDialog(page, "New rank", "New rank");
  await rankDialog.getByLabel("Name").fill(rank);
  await rankDialog.getByLabel("Colour").selectOption("WHITE");
  await rankDialog.getByRole("button", { name: "Save" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${rank} was saved` })).toBeVisible();
  await expect(rankDialog).toBeHidden();

  // two students to check in
  await nav(page, "Students").click();
  for (const student of [ada, alan]) {
    const studentDialog = await openDialog(page, "New student", "New student");
    await studentDialog.getByLabel("First name").fill(student.first);
    await studentDialog.getByLabel("Last name").fill(student.last);
    await studentDialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: `${student.first} ${student.last} was saved` })).toBeVisible();
    await expect(studentDialog).toBeHidden();
  }
});

test("an instructor checks in two students, undoes one, and the student page shows the count", async ({
  browser,
  page,
  request,
}) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const link = await invite(page, request, "Ivy Instructor", instructorEmail, "Instructor");
  const { context, page: ivy } = await signedInThrough(browser, link);

  await nav(ivy, "Timetable").click();
  await expect(ivy.getByRole("button", { name: /^(New class|Edit|Remove)/ })).toHaveCount(0);
  await ivy.getByRole("link", { name: `Check in ${kids}`, exact: true }).click();
  await expect(ivy.getByRole("heading", { name: `Check in: ${kids}`, level: 2 })).toBeVisible();
  await expect(ivy.getByLabel("Date")).toHaveValue(isoDate(today));

  const answered = countMarkAnswers(ivy);

  // the search narrows the list in the browser to this file's two students
  await ivy.getByLabel("Search students").fill(tag);
  await expect(toggle(ivy, adaName)).toHaveAttribute("aria-pressed", "false");
  await expect(toggle(ivy, alanName)).toHaveAttribute("aria-pressed", "false");

  await toggle(ivy, adaName).click();
  await toggle(ivy, alanName).click();
  await expect(toggle(ivy, adaName)).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(ivy, alanName)).toHaveAttribute("aria-pressed", "true");
  // tapping again undoes it
  await toggle(ivy, alanName).click();
  await expect(toggle(ivy, alanName)).toHaveAttribute("aria-pressed", "false");

  // a double tap is present then not present: it ends as it began, and so does the server
  await toggle(ivy, alanName).dblclick();
  await expect(toggle(ivy, alanName)).toHaveAttribute("aria-pressed", "false");

  // the marks are the server's: they survive a reload, once the queued taps (five of them) have all
  // been answered
  await expect.poll(answered).toBe(5);
  await expect.poll(() => serverMarks(ivy, today)).toMatchObject({ [adaName]: true, [alanName]: false });
  await ivy.reload();
  await ivy.getByLabel("Search students").fill(tag);
  await expect(toggle(ivy, adaName)).toHaveAttribute("aria-pressed", "true");
  await expect(toggle(ivy, alanName)).toHaveAttribute("aria-pressed", "false");

  // catching up: last week's class, same weekday, starts with nobody present
  await ivy.getByLabel("Date").fill(isoDate(lastWeek));
  await ivy.getByLabel("Search students").fill(tag);
  await expect(toggle(ivy, adaName)).toHaveAttribute("aria-pressed", "false");
  await toggle(ivy, adaName).click();
  await expect(toggle(ivy, adaName)).toHaveAttribute("aria-pressed", "true");

  await expect.poll(answered).toBe(6);
  await expect.poll(() => serverMarks(ivy, lastWeek)).toMatchObject({ [adaName]: true, [alanName]: false });

  // a date the class does not run on is refused in the server's words, with no list
  await ivy.getByLabel("Date").fill(isoDate(daysFromToday(-1)));
  await expect(ivy.getByText(/^Must be a .+, when .+ runs$/)).toBeVisible();
  await expect(toggle(ivy, adaName)).toHaveCount(0);

  // Ada's page: both classes counted (never promoted), then only those after the promotion
  await nav(ivy, "Students").click();
  await ivy.getByLabel("Search students").fill(tag);
  await ivy.getByRole("link", { name: adaName, exact: true }).click();
  await expect(ivy.getByRole("heading", { name: adaName, level: 2 })).toBeVisible();
  const since = ivy.getByText("Classes since last promotion").locator("xpath=following-sibling::*[1]");
  await expect(since).toHaveText("2 (all, not promoted yet)");
  const attendance = ivy.getByRole("list", { name: "Attendance" });
  await expect(attendance.getByRole("listitem")).toHaveCount(2);
  await expect(attendance.getByRole("listitem").first()).toContainText(kids);

  // her promotion is dated between the two classes: only the later one counts
  const promote = await openDialog(ivy, "Promote", `Promote ${adaName}`);
  await promote.getByLabel("Rank").selectOption({ label: rank });
  await promote.getByLabel("Date").fill(isoDate(promotedOn));
  await promote.getByRole("button", { name: "Promote" }).click();
  await expect(ivy.getByRole("status").filter({ hasText: `${adaName} was promoted` })).toBeVisible();
  await expect(since).toHaveText("1");

  // taking the promotion back puts the count back, and frees the rank
  await ivy.getByRole("button", { name: new RegExp(`^Remove the promotion to ${rank}`) }).click();
  await ivy.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(since).toHaveText("2 (all, not promoted yet)");

  await context.close();
});

test("a class with attendance cannot be removed", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await nav(page, "Timetable").click();

  await page.getByRole("button", { name: `Remove ${kids}`, exact: true }).click();
  await page.getByRole("alertdialog", { name: `Remove ${kids}?` }).getByRole("button", { name: "Remove" }).click();

  await expect(page.getByText(`Students have attended ${kids}`)).toBeVisible();
  await expect(page.getByRole("region", { name: todayName, exact: true }).getByText(kids)).toBeVisible();

  // the rank made for the promotion goes, so the ranks page is as other specs expect
  await nav(page, "Ranks").click();
  await page.getByRole("row", { name: new RegExp(rank) }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${rank} was removed` })).toBeVisible();
});

test("a member sees the timetable and a student's attendance, read-only", async ({ browser, page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const link = await invite(page, request, "Mo Member", memberEmail, "Member");
  const { context, page: mo } = await signedInThrough(browser, link);

  await nav(mo, "Timetable").click();
  await expect(mo.getByRole("heading", { name: "Timetable", level: 2 })).toBeVisible();
  await expect(mo.getByRole("region", { name: todayName, exact: true }).getByText(kids)).toBeVisible();
  await expect(mo.getByRole("button", { name: /^(New class|Edit|Remove)/ })).toHaveCount(0);
  await expect(mo.getByRole("link", { name: /^Check in/ })).toHaveCount(0);

  await nav(mo, "Students").click();
  await mo.getByLabel("Search students").fill(tag);
  await mo.getByRole("link", { name: adaName, exact: true }).click();
  await expect(mo.getByRole("list", { name: "Attendance" }).getByRole("listitem")).toHaveCount(2);
  await expect(mo.getByText("Classes since last promotion")).toBeVisible();

  // the check-in page is not theirs: they are sent Home
  const id = await page.evaluate(async (name) => {
    const answer = await fetch("/api/classes", { credentials: "same-origin" });
    const classes = (await answer.json()) as { id: string; name: string }[];
    return classes.find((schoolClass) => schoolClass.name === name)?.id;
  }, kids);
  expect(id).toBeTruthy();
  await mo.goto(`/classes/${id}/check-in`);
  await expect(mo.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();

  await context.close();
});

test("signed out, a deep link reloads to sign-in and signing in goes back to it", async ({ browser, page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const id = await page.evaluate(async (name) => {
    const answer = await fetch("/api/classes", { credentials: "same-origin" });
    const classes = (await answer.json()) as { id: string; name: string }[];
    return classes.find((schoolClass) => schoolClass.name === name)?.id;
  }, kids);
  expect(id).toBeTruthy();

  const date = isoDate(lastWeek);
  for (const [path, heading] of [
    ["/timetable", "Timetable"],
    [`/classes/${id}/check-in?date=${date}`, `Check in: ${kids}`],
  ]) {
    const context = await browser.newContext();
    const stranger = await context.newPage();
    const response = await stranger.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(stranger.getByRole("heading", { name: "Sign in", level: 2 }), path).toBeVisible();

    await signInByLink(stranger, request, ownerEmail, { name: heading, level: 2 });
    expect(new URL(stranger.url()).pathname + new URL(stranger.url()).search, path).toBe(path);
    await context.close();
  }
});
