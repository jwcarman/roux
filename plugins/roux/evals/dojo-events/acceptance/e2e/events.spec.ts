// The eval's hidden check of the Events page in the case's prompt; the agent never sees it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDialog, ownerEmail, signInByLink } from "./helpers";

async function openEvents(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Events" }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/events$/);
  return page.getByRole("table", { name: "Events" });
}

async function fillEvent(dialog: Locator, name: string, startDate: string, endDate: string) {
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Start date").fill(startDate);
  await dialog.getByLabel("End date").fill(endDate);
}

async function addEvent(page: Page, name: string, startDate: string, endDate: string) {
  const dialog = await openDialog(page, "New event", "New event");
  await fillEvent(dialog, name, startDate, endDate);
  await dialog.getByRole("button", { name: "Save" }).click();
  return dialog;
}

/** Where a row naming `text` comes in the table, top first. */
async function rowIndex(table: Locator, text: string) {
  const rows = await table.getByRole("row").allTextContents();
  return rows.findIndex((row) => row.includes(text));
}

test("the owner adds events in a dialog, sees them soonest first and edits one", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const table = await openEvents(page);
  await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Start date" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "End date" })).toBeVisible();

  await expect(await addEvent(page, `Seminar ${tag}`, "2033-09-10", "2033-09-11")).toBeHidden();
  await expect(await addEvent(page, `Open day ${tag}`, "2033-02-01", "2033-02-02")).toBeHidden();
  await expect(table.getByRole("row").filter({ hasText: `Seminar ${tag}` })).toBeVisible();
  await expect(table.getByRole("row").filter({ hasText: `Open day ${tag}` })).toBeVisible();
  expect(await rowIndex(table, `Open day ${tag}`)).toBeLessThan(await rowIndex(table, `Seminar ${tag}`));

  await table.getByRole("row").filter({ hasText: `Seminar ${tag}` }).getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: `Edit Seminar ${tag}` });
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel("Name")).toHaveValue(`Seminar ${tag}`);
  await expect(edit.getByLabel("Start date")).toHaveValue("2033-09-10");
  await edit.getByLabel("Name").fill(`Workshop ${tag}`);
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  await expect(table.getByRole("row").filter({ hasText: `Workshop ${tag}` })).toBeVisible();
});

test("an end date that is not after the start is refused under the End date field", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await openEvents(page);

  const dialog = await addEvent(page, `Backwards ${tag}`, "2033-05-10", "2033-05-09");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("End date")).toHaveAttribute("aria-invalid", "true");
  await expect(dialog.getByText("Must be after the start date")).toBeVisible();
});
