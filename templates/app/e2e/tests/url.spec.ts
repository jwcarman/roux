import { expect, test } from "@playwright/test";
import { openDialog, ownerEmail, signInByLink } from "./helpers";

test("the users table keeps its page, sort and search in the URL", async ({ page, request }) => {
  // Signed out, the route sends the visitor to sign in, and signing in goes back to the page.
  await page.goto("/users");
  await expect(page).toHaveURL(/\/signin$/);
  await signInByLink(page, request, ownerEmail, { name: "Users", level: 2 });

  // Enough users for three pages of one, named with a tag only this run uses.
  const tag = `url${Date.now().toString(36)}`;
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  for (const first of ["Uma", "Val"]) {
    const dialog = await openDialog(page, "Invite user", "Invite a user");
    await dialog.getByRole("textbox", { name: "Name", exact: true }).fill(`${first} ${tag}`);
    await dialog.getByRole("textbox", { name: "Email", exact: true }).fill(`${first.toLowerCase()}.${tag}@example.test`);
    await dialog.getByRole("button", { name: "Send invitation" }).click();
    await expect(dialog).toBeHidden();
    // the user's own row, not a toast an earlier invitation left on screen, proves this one saved
    await expect(page.getByRole("cell", { name: `${first} ${tag}`, exact: true })).toBeVisible();
  }

  // A link opens the table where it says: one row a page, the second page, by email descending.
  await page.goto("/users?pageSize=1&pageIndex=1&sortBy=EMAIL&sortDirection=DESC");
  const table = page.getByRole("table", { name: "Users" });
  await expect(table.getByRole("columnheader", { name: "Email" })).toHaveAttribute("aria-sort", "descending");
  await expect(page.getByText(/^Showing 2 to 2 of \d+ rows$/)).toBeVisible();

  // Paging goes into the history: a reload stays put, Back goes back.
  await page.getByRole("button", { name: "Next page" }).click();
  await expect(page).toHaveURL(/pageIndex=2/);
  await page.reload();
  await expect(page.getByText(/^Showing 3 to 3 of \d+ rows$/)).toBeVisible();
  await page.goBack();
  await expect(page).toHaveURL(/pageIndex=1/);
  await expect(page.getByText(/^Showing 2 to 2 of \d+ rows$/)).toBeVisible();

  // A search goes into the URL from the first page, and the field shows it after a reload.
  await page.getByLabel("Search users").fill(tag);
  await expect(page).toHaveURL(new RegExp(`search=${tag}`));
  await expect(page).not.toHaveURL(/pageIndex=/);
  await page.reload();
  await expect(page.getByLabel("Search users")).toHaveValue(tag);
  await expect(page.getByText(/^Showing 1 to 1 of 2 rows$/)).toBeVisible();

  // A filter chip goes into the URL and survives a reload.
  await page.goto("/users");
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Deactivated" }).click();
  await expect(page).toHaveURL(/status=DEACTIVATED/);
  await page.reload();
  await expect(
    page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Deactivated" }),
  ).toHaveAttribute("aria-pressed", "true");

  // Nonsense in the URL is ignored: an unknown sort and a negative page give the defaults.
  await page.goto("/users?sortBy=PASSWORD&pageIndex=-3");
  await expect(table.getByRole("columnheader", { name: "Name" })).toHaveAttribute("aria-sort", "ascending");
  await expect(page.getByText(/^Showing 1 to \d+ of \d+ rows$/)).toBeVisible();
});
