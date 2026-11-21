import { expect, test } from "@playwright/test";
import { inboxSnapshot, nextSignInLink, openDialog, openLink, ownerEmail, ownerName, signInByLink } from "./helpers";

test("an owner invites, deactivates and reactivates a user, with the history to show for it", async ({
  browser,
  page,
  request,
}) => {
  const tag = `life${Date.now().toString(36)}`;
  const name = `Grace ${tag}`;
  const email = `grace.${tag}@example.test`;

  // The owner invites Grace from the dialog.
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  const seen = await inboxSnapshot(request, email);
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  await expect(dialog).toBeHidden();

  // Grace signs in, in a browser of her own.
  const graceContext = await browser.newContext();
  const gracePage = await graceContext.newPage();
  await openLink(gracePage, await nextSignInLink(request, email, seen));
  await expect(gracePage.getByText(`Welcome, ${name}`)).toBeVisible();

  // Her name in the directory leads to her page.
  await page.getByLabel("Search users").fill(tag);
  await page.getByRole("link", { name, exact: true }).click();
  await expect(page.getByRole("heading", { name, level: 2 })).toBeVisible();
  // The Status value (a <dd>), not the history line that says the same word.
  const status = page.getByRole("definition").filter({ hasText: /^(Active|Deactivated)$/ });
  await expect(status).toHaveText("Active");

  // Deactivating asks first, with Cancel focused so Enter alone does nothing.
  await page.getByRole("button", { name: "Deactivate" }).click();
  const question = page.getByRole("alertdialog", { name: `Deactivate ${name}?` });
  await expect(question).toContainText("They won't be able to sign in.");
  await expect(question.getByRole("button", { name: "Cancel" })).toBeFocused();
  await question.getByRole("button", { name: "Deactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} was deactivated` })).toBeVisible();
  await expect(status).toHaveText("Deactivated");

  // Her open session ends at her next request.
  expect((await gracePage.request.get("/api/users/me")).status()).toBe(401);

  // The directory shows her only under Deactivated.
  await page.getByRole("link", { name: "All users" }).click();
  await page.getByLabel("Search users").fill(tag);
  await expect(page.getByText("No users found.")).toBeVisible();
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Deactivated" }).click();
  await expect(page.getByRole("link", { name, exact: true })).toBeVisible();

  // Reactivating does not ask; the history records all of it, newest first, by the owner.
  await page.getByRole("link", { name, exact: true }).click();
  await page.getByRole("button", { name: "Reactivate" }).click();
  await expect(page.getByRole("status").filter({ hasText: `${name} was reactivated` })).toBeVisible();
  const history = page.getByRole("list", { name: "History" });
  await expect(history.getByRole("listitem")).toHaveCount(3);
  await expect(history.getByRole("listitem").nth(0)).toContainText("Reactivated");
  await expect(history.getByRole("listitem").nth(1)).toContainText("Deactivated");
  await expect(history.getByRole("listitem").nth(2)).toContainText(`Invited ${name}`);
  await expect(history.getByRole("listitem").nth(0)).toContainText(`by ${ownerName}`);

  await graceContext.close();
});

test("a page or user that does not exist says so", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  await page.goto("/no-such-page");
  await expect(page.getByRole("heading", { name: "Page not found" })).toBeVisible();

  for (const id of ["00000000-0000-7000-8000-000000000000", "abc"]) {
    await page.goto(`/users/${id}`);
    await expect(page.getByRole("heading", { name: "User not found" })).toBeVisible();
  }
});

test("defaults stay out of the URL", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  await expect(page).toHaveURL(/\/users$/);

  // Name descending is not the default, so it shows; back to ascending, it does not.
  const table = page.getByRole("table", { name: "Users" });
  await table.getByRole("button", { name: "Name" }).click();
  await expect(page).toHaveURL(/sortDirection=DESC/);
  await table.getByRole("button", { name: "Name" }).click();
  await expect(page).toHaveURL(/\/users$/);

  // Choosing the Active chip, the default, adds nothing.
  await page.getByRole("group", { name: "Status" }).getByRole("button", { name: "Active" }).click();
  await expect(page).toHaveURL(/\/users$/);
});
