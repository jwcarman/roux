import { expect, test } from "@playwright/test";
import { ownerEmail, signInByLink } from "./helpers";

test("an item added for today is in today's column of the week, and a link to the item", async ({
  page,
  request,
}) => {
  const title = `Water the plants ${Date.now()}`;

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Items" }).click();
  // Day left blank: the item is for today.
  await page.getByRole("textbox", { name: "New item" }).fill(title);
  await page.getByRole("button", { name: "Add item" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Item added" }),
  ).toBeVisible();

  await nav.getByRole("link", { name: "Week" }).click();
  const today = page
    .getByRole("group", { name: "Days of the week" })
    .locator('section[aria-current="date"]');
  await expect(today.getByText("Today")).toBeVisible();
  await today.getByRole("link", { name: title }).click();
  await expect(page.getByRole("heading", { name: title })).toBeVisible();
});
