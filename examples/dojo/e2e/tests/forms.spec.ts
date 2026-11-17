import { expect, test } from "@playwright/test";
import { ownerEmail, signInByLink } from "./helpers";

test("one click on submit, right after leaving a field with a mistake, checks the whole form", async ({
  page,
  request,
}) => {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" }).click();

  // Leaving the field shows its error; the submit button must not move away from the click.
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByRole("textbox", { name: "Email", exact: true }).fill("ada@");
  const send = page.getByRole("button", { name: "Send invitation" });
  // Measure once the dialog has finished opening: it scales in.
  const dialog = page.getByRole("dialog", { name: "Invite a member" });
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((a) => a.finished)));
  const before = await send.boundingBox();
  await send.click();

  await expect(page.getByText("Must be a valid email address")).toBeVisible();
  await expect(page.getByText("Must not be blank")).toBeVisible();
  expect(await send.boundingBox()).toEqual(before);
});
