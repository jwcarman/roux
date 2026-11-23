// The eval's hidden check of the Locations page in the case's prompt; the agent never sees it.
import { expect, test, type Locator, type Page } from "@playwright/test";
import { openDialog, ownerEmail, signInByLink } from "./helpers";

/** Picks a kind by its label, whether the form shows a select or radio buttons. */
async function chooseKind(dialog: Locator, label: string) {
  const select = dialog.getByRole("combobox", { name: "Kind" });
  if ((await select.count()) > 0) {
    await select.selectOption({ label });
  } else {
    await dialog.getByRole("radio", { name: label }).check({ force: true });
  }
}

async function openLocations(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Locations" }).click({ timeout: 15_000 });
  await expect(page).toHaveURL(/\/locations$/);
  return page.getByRole("table", { name: "Locations" });
}

async function addLocation(page: Page, name: string, kind: string) {
  const dialog = await openDialog(page, "New location", "New location");
  await dialog.getByLabel("Name").fill(name);
  await chooseKind(dialog, kind);
  await dialog.getByRole("button", { name: "Save" }).click();
  return dialog;
}

test("the owner adds a location in a dialog, sees it in the table and edits it", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const table = await openLocations(page);
  await expect(table.getByRole("columnheader", { name: "Name" })).toBeVisible();
  await expect(table.getByRole("columnheader", { name: "Kind" })).toBeVisible();

  const dialog = await addLocation(page, `Harbour ${tag}`, "Satellite");
  await expect(dialog).toBeHidden();
  const row = table.getByRole("row").filter({ hasText: `Harbour ${tag}` });
  await expect(row).toBeVisible();
  await expect(row.getByRole("cell", { name: "Satellite", exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Edit" }).click();
  const edit = page.getByRole("dialog", { name: `Edit Harbour ${tag}` });
  await expect(edit).toBeVisible();
  await expect(edit.getByLabel("Name")).toHaveValue(`Harbour ${tag}`);
  await edit.getByLabel("Name").fill(`Lighthouse ${tag}`);
  await chooseKind(edit, "Outdoor");
  await edit.getByRole("button", { name: "Save" }).click();
  await expect(edit).toBeHidden();
  const changed = table.getByRole("row").filter({ hasText: `Lighthouse ${tag}` });
  await expect(changed.getByRole("cell", { name: "Outdoor", exact: true })).toBeVisible();
});

test("another location's name is refused under the Name field", async ({ page, request }) => {
  const tag = Date.now().toString(36);
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await openLocations(page);
  await expect(await addLocation(page, `Twin ${tag}`, "Main dojo")).toBeHidden();

  const dialog = await addLocation(page, `Twin ${tag}`, "Outdoor");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByLabel("Name")).toHaveAttribute("aria-invalid", "true");
});
