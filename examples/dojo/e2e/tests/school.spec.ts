import { expect, test, type APIRequestContext, type Browser, type Page } from "@playwright/test";
import { inboxSnapshot, nextSignInLink, openDialog, openLink, ownerEmail, signInByLink } from "./helpers";

// One school for the whole file: the tests run in order and each builds on the last.
test.describe.configure({ mode: "serial" });

const tag = `sch${Date.now().toString(36)}`;
const ranks = [`White ${tag}`, `Yellow ${tag}`, `Orange ${tag}`];
const student = { first: "Ada", last: `Lovelace ${tag}` };
const studentName = `${student.first} ${student.last}`;
const instructorEmail = `ivy.${tag}@dojo.test`;
const memberEmail = `mo.${tag}@dojo.test`;

/** The owner, signed in on `page`, invites `name` and returns the sign-in link the invitation sent. */
async function invite(
  page: Page,
  request: APIRequestContext,
  name: string,
  email: string,
  role: "Member" | "Instructor",
): Promise<string> {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" }).click();
  const seen = await inboxSnapshot(request, email);
  const dialog = await openDialog(page, "Invite member", "Invite a member");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  await expect(dialog).toBeHidden();
  return nextSignInLink(request, email, seen);
}

/** A browser of its own, signed in through `link`, on the home page. */
async function signedInThrough(browser: Browser, link: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openLink(page, link);
  await expect(page.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();
  return { context, page };
}

/** The names of this file's ranks in the ladder, top to bottom. */
async function ladder(page: Page): Promise<string[]> {
  const rows = await page.getByRole("row", { name: new RegExp(tag) }).allTextContents();
  return rows.map((row) => row.match(new RegExp(`[A-Z][a-z]+ ${tag}`))?.[0] ?? row);
}

test("the owner adds three ranks and reorders one", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ranks" }).click();
  await expect(page.getByRole("heading", { name: "Ranks", level: 2 })).toBeVisible();

  for (const [index, name] of ranks.entries()) {
    const dialog = await openDialog(page, "New rank", "New rank");
    await dialog.getByLabel("Name").fill(name);
    await dialog.getByLabel("Colour").selectOption(["WHITE", "YELLOW", "ORANGE"][index]);
    await dialog.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: `${name} was saved` })).toBeVisible();
    await expect(dialog).toBeHidden();
  }
  expect(await ladder(page)).toEqual(ranks);

  // The ladder runs lowest first: the first rank cannot move down, the last cannot move up.
  await expect(page.getByRole("button", { name: `Move ${ranks[0]} down` })).toBeDisabled();
  await expect(page.getByRole("button", { name: `Move ${ranks[2]} up` })).toBeDisabled();
  await page.getByRole("button", { name: `Move ${ranks[0]} up` }).click();
  await expect.poll(() => ladder(page)).toEqual([ranks[1], ranks[0], ranks[2]]);

  // The order is the server's: it survives a reload.
  await page.reload();
  await expect.poll(() => ladder(page)).toEqual([ranks[1], ranks[0], ranks[2]]);
});

test("an instructor adds a student, promotes them twice and takes the latest promotion back", async ({
  browser,
  page,
  request,
}) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const link = await invite(page, request, "Ivy Instructor", instructorEmail, "Instructor");
  const { context, page: ivy } = await signedInThrough(browser, link);

  await ivy.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Students" }).click();
  await expect(ivy.getByRole("heading", { name: "Students", level: 2 })).toBeVisible();
  const dialog = await openDialog(ivy, "New student", "New student");
  await dialog.getByLabel("First name").fill(student.first);
  await dialog.getByLabel("Last name").fill(student.last);
  await dialog.getByRole("button", { name: "Save" }).click();
  await expect(ivy.getByRole("status").filter({ hasText: `${studentName} was saved` })).toBeVisible();
  await ivy.getByLabel("Search students").fill(tag);
  await ivy.getByRole("link", { name: studentName, exact: true }).click();
  await expect(ivy.getByRole("heading", { name: studentName, level: 2 })).toBeVisible();
  const current = ivy.getByText("Current rank").locator("xpath=following-sibling::*[1]");
  await expect(current).toHaveText("Not promoted yet");

  // Two promotions, the earlier date first: the later date is the current rank.
  const [first, second] = [ranks[0], ranks[1]];
  for (const [rank, date] of [
    [first, "2020-01-01"],
    [second, "2021-06-01"],
  ]) {
    const promote = await openDialog(ivy, "Promote", `Promote ${studentName}`);
    await promote.getByLabel("Rank").selectOption({ label: rank });
    await promote.getByLabel("Date").fill(date);
    await promote.getByRole("button", { name: "Promote" }).click();
    await expect(ivy.getByRole("status").filter({ hasText: `${studentName} was promoted` })).toBeVisible();
    await expect(promote).toBeHidden();
  }
  await expect(current).toHaveText(second);
  const history = ivy.getByRole("table", { name: "Promotions" });
  await expect(history.getByRole("row")).toHaveCount(3);

  // A rank a student has held cannot be removed: the owner is refused, with the reason.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Ranks" }).click();
  await page.getByRole("row", { name: new RegExp(second) }).getByRole("button", { name: "Remove" }).click();
  await page.getByRole("alertdialog").getByRole("button", { name: "Remove" }).click();
  await expect(page.getByText(`Students hold or have held ${second}`)).toBeVisible();

  // Taking the latest promotion back asks first, and the rank falls back.
  await ivy.getByRole("button", { name: new RegExp(`^Remove the promotion to ${second}`) }).click();
  const question = ivy.getByRole("alertdialog", { name: `Remove the promotion to ${second}?` });
  await question.getByRole("button", { name: "Remove" }).click();
  await expect(ivy.getByRole("status").filter({ hasText: `The promotion to ${second} was removed` })).toBeVisible();
  await expect(current).toHaveText(first);
  await expect(history.getByRole("row")).toHaveCount(2);

  await context.close();
});

test("a member sees the ranks and students, read-only", async ({ browser, page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const link = await invite(page, request, "Mo Member", memberEmail, "Member");
  const { context, page: mo } = await signedInThrough(browser, link);
  const nav = mo.getByRole("navigation", { name: "Main" });

  await nav.getByRole("link", { name: "Ranks" }).click();
  await expect(mo.getByRole("heading", { name: "Ranks", level: 2 })).toBeVisible();
  expect(await ladder(mo)).toEqual([ranks[1], ranks[0], ranks[2]]);
  for (const button of ["New rank", "Edit", "Remove"]) {
    await expect(mo.getByRole("button", { name: button })).toHaveCount(0);
  }
  await expect(mo.getByRole("button", { name: /^Move / })).toHaveCount(0);

  await nav.getByRole("link", { name: "Students" }).click();
  await expect(mo.getByRole("heading", { name: "Students", level: 2 })).toBeVisible();
  await mo.getByLabel("Search students").fill(tag);
  await expect(mo.getByRole("link", { name: studentName, exact: true })).toBeVisible();
  await expect(mo.getByRole("button", { name: /^(New student|Edit|Deactivate)/ })).toHaveCount(0);

  await mo.getByRole("link", { name: studentName, exact: true }).click();
  await expect(mo.getByRole("heading", { name: studentName, level: 2 })).toBeVisible();
  await expect(mo.getByRole("table", { name: "Promotions" })).toBeVisible();
  await expect(mo.getByRole("button", { name: /^(Promote|Remove|Edit|Deactivate)/ })).toHaveCount(0);

  await context.close();
});

test("signed out, a reload of a school page lands on sign-in, not a 401 page", async ({ browser, page, request }) => {
  await page.goto("/students");
  await signInByLink(page, request, ownerEmail);
  await page.goto("/students");
  await page.getByRole("link", { name: /./ }).first().waitFor();
  const id = await page.evaluate(async () => {
    const answer = await fetch("/api/students?search=Lovelace", { credentials: "same-origin" });
    return ((await answer.json()) as { data: { id: string }[] }).data[0]?.id;
  });
  expect(id).toBeTruthy();

  const context = await browser.newContext();
  const stranger = await context.newPage();
  for (const path of ["/ranks", "/students", `/students/${id}`]) {
    const response = await stranger.goto(path);
    expect(response?.status(), path).toBe(200);
    await expect(stranger.getByRole("heading", { name: "Sign in", level: 2 }), path).toBeVisible();
  }
  await context.close();
});
