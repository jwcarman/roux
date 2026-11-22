import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ownerEmail, ownerName, signInByLink } from "./helpers";

// How the pages look, which jsdom cannot judge: color contrast and other WCAG A/AA rules in both
// color modes, and no sideways scrolling at phone width.

async function openUsers(page: Page, request: Parameters<typeof signInByLink>[1]) {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("table", { name: "Users" }).getByRole("row").nth(1)).toBeVisible();
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    "WCAG A/AA violations",
  ).toEqual([]);
}

for (const colorScheme of ["light", "dark"] as const) {
  test(`the signed-in pages meet WCAG AA in ${colorScheme} mode`, async ({ page, request }) => {
    await page.emulateMedia({ colorScheme });
    await openUsers(page, request);
    await expect(page.locator("html")).toHaveClass(new RegExp(colorScheme));
    await expectAccessible(page);

    // An open dialog, once it has finished opening.
    await page.getByRole("button", { name: "Invite user" }).click();
    const dialog = page.getByRole("dialog", { name: "Invite a user" });
    await expect(dialog).toBeVisible();
    await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((a) => a.finished)));
    await expectAccessible(page);
    await page.keyboard.press("Escape");
    await expect(dialog).toBeHidden();

    // A user's page, with its history.
    await page.getByRole("table", { name: "Users" }).getByRole("link").first().click();
    await expect(page.getByRole("heading", { name: "History", level: 3 })).toBeVisible();
    await expectAccessible(page);

    await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Home" }).click();
    await expect(page.getByRole("heading", { name: /^Welcome/, level: 2 })).toBeVisible();
    await expectAccessible(page);
  });
}

test("on a phone the navigation is a drawer, and nothing scrolls sideways", async ({ page, request }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBe(0);

  await page.getByRole("button", { name: "Open navigation" }).click();
  const drawer = page.getByRole("dialog", { name: "Navigation" });
  await expect(drawer.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" })).toBeVisible();
  // Scan once it has slid in: mid-animation its text is half transparent.
  await drawer.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((a) => a.finished)));
  await expectAccessible(page);

  await drawer.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users", level: 2 })).toBeVisible();
  await expect(drawer).toBeHidden();
});

test("at tablet width the sidebar is an icon rail whose links keep their names", async ({ page, request }) => {
  await page.setViewportSize({ width: 820, height: 1000 });
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  const nav = page.getByRole("navigation", { name: "Main" });
  await expect(nav.getByText("Users", { exact: true })).toBeHidden();
  await nav.getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users", level: 2 })).toBeVisible();
  await expect(nav.getByRole("link", { name: "Users" })).toHaveAttribute("aria-current", "page");
  // The rail's account button is only the initials, and stays big enough to hit.
  const account = page.getByRole("button", { name: "Account" });
  await expect(account.getByText(ownerName, { exact: true })).toBeHidden();
  const box = await account.boundingBox();
  expect(box?.height ?? 0).toBeGreaterThanOrEqual(32);
  expect(box?.width ?? 0).toBeGreaterThanOrEqual(32);
  await expectAccessible(page);
});
