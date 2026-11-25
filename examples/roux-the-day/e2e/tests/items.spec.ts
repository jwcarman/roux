import { expect, test } from "@playwright/test";
import {
  invite,
  openDialog,
  ownerEmail,
  ownerName,
  signInByLink,
} from "./helpers";

test("the owner adds an item for two people, then finds it by search and by filter", async ({
  page,
  request,
}) => {
  const stamp = Date.now();
  const hedy = `Hedy ${stamp}`;
  const title = `Order the venue ${stamp}`;

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await invite(page, request, hedy, `hedy-${stamp}@example.test`, "User");

  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Items" })
    .click();
  const dialog = await openDialog(page, "Add item", "Add an item");
  await dialog.getByLabel("Title").fill(title);
  // Today and all day, assigned to whoever adds it: add Hedy too.
  await dialog
    .getByRole("group", { name: "Assigned to" })
    .getByText(hedy)
    .click();
  await dialog.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: `Added ${title}` }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();

  const table = page.getByRole("table", { name: "Items" });
  await page
    .getByRole("searchbox", { name: "Search items" })
    .fill(`venue ${stamp}`);
  const row = table.getByRole("row").filter({ hasText: title });
  await expect(row).toHaveCount(1);
  await expect(
    row.getByRole("cell", { name: `${hedy}, ${ownerName}` }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Today" }).click();
  await expect(row).toHaveCount(1);
  await page.getByRole("button", { name: "Done" }).click();
  await expect(table.getByText("No items found.")).toBeVisible();
});
