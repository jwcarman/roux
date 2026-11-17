import { expect, test } from "@playwright/test";
import { openDialog, ownerEmail, ownerName, signInByLink } from "./helpers";

test("the owner sees their name and sorts the directory by role, owners first", async ({ page, request }) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await expect(page.getByText(`Welcome, ${ownerName}`)).toBeVisible();
  await expect(page.getByRole("region", { name: "Account" }).getByText(ownerName, { exact: true })).toBeVisible();

  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" }).click();
  const table = page.getByRole("table", { name: "Members" });
  await expect(table.getByRole("cell", { name: ownerName, exact: true })).toBeVisible();

  // A member whose name sorts before the owner's, so only the role sort puts the owner first.
  const dialog = await openDialog(page, "Invite member", "Invite a member");
  await dialog.getByLabel("Name").fill("Aaron Member");
  await dialog.getByLabel("Email").fill(`aaron-${Date.now()}@dojo.test`);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(table.getByRole("cell", { name: "Aaron Member", exact: true })).toBeVisible();
  await expect(table.getByRole("row").nth(1).getByRole("cell").first()).toHaveText("Aaron Member");

  const role = table.getByRole("columnheader", { name: "Role" });
  await table.getByRole("button", { name: "Role" }).click();
  await expect(role).toHaveAttribute("aria-sort", "ascending");
  await expect(table.getByRole("row").nth(1).getByRole("cell").nth(2)).toHaveText("Owner");

  await table.getByRole("button", { name: "Role" }).click();
  await expect(role).toHaveAttribute("aria-sort", "descending");
  await expect(table.getByRole("row").last().getByRole("cell").nth(2)).toHaveText("Owner");
});
