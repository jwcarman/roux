import { expect, test } from "@playwright/test";
import { openDialog, ownerEmail, ownerName, signInByLink } from "./helpers";

test("the owner sees their name and sorts the directory by role name", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await expect(page.getByRole("heading", { name: `Welcome, ${ownerName}`, level: 2 })).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" }).getByText(ownerName, { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  const table = page.getByRole("table", { name: "Users" });
  await expect(table.getByRole("cell", { name: ownerName, exact: true })).toBeVisible();

  // A user whose name sorts before the owner's, so only the role sort can put the owner first.
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill("Aaron User");
  await dialog.getByLabel("Email").fill(`aaron-${Date.now()}@example.test`);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(table.getByRole("cell", { name: "Aaron User", exact: true })).toBeVisible();
  await expect(table.getByRole("row").nth(1).getByRole("cell").first()).toHaveText("Aaron User");

  const role = table.getByRole("columnheader", { name: "Role" });
  await table.getByRole("button", { name: "Role" }).click();
  // roux sorts by the role's name: OWNER, then USER.
  await expect(role).toHaveAttribute("aria-sort", "ascending");
  await expect(table.getByRole("row").nth(1).getByRole("cell").nth(2)).toHaveText("Owner");

  await table.getByRole("button", { name: "Role" }).click();
  await expect(role).toHaveAttribute("aria-sort", "descending");
  await expect(table.getByRole("row").nth(1).getByRole("cell").nth(2)).not.toHaveText("Owner");
});
