import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";
import { ownerEmail, signInByLink } from "./helpers";

declare global {
  interface Window {
    cspViolations: string[];
  }
}

// The owner changes how the app looks, and every visitor gets it: the name in the title and the
// header, the palette, and a bundled font loaded under the Content-Security-Policy.

async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
  });
}

async function openAppearance(page: Page) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Appearance" }).click();
  await expect(page.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();
}

async function expectAccessible(page: Page) {
  const { violations } = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa"]).analyze();
  expect(
    violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(" ")).join(", ")}`),
    "WCAG A/AA violations",
  ).toEqual([]);
}

test("the owner's new look reaches every visitor", async ({ page, request, browser }) => {
  await recordViolations(page);
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await openAppearance(page);
  const name = page.getByRole("textbox", { name: "What should the app be called?" });
  const original = await name.inputValue();

  try {
    await page.getByRole("button", { name: "Friendly" }).click();
    await name.fill("Dojo Test");
    // The preview: the owner's own sidebar shows the draft before it is saved.
    await expect(page.getByRole("complementary").getByText("Dojo Test")).toBeVisible();
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "The new look is saved" })).toBeVisible();

    const visitor = await browser.newContext();
    try {
      const signIn = await visitor.newPage();
      await recordViolations(signIn);
      await signIn.goto("/signin");
      await expect(signIn).toHaveTitle("Dojo Test");
      await expect(signIn.getByRole("banner").getByText("Dojo Test")).toBeVisible();
      const button = signIn.getByRole("button", { name: "Email me a link" });
      await expect(button).toBeVisible();
      await expect
        .poll(() => button.evaluate((element) => getComputedStyle(element).fontFamily))
        .toContain("Nunito Variable");
      await expect.poll(() => signIn.evaluate(() => document.fonts.check('16px "Nunito Variable"'))).toBe(true);
      expect(await button.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe(
        "rgb(24, 24, 27)",
      );
      expect(await signIn.evaluate(() => window.cspViolations)).toEqual([]);
    } finally {
      await visitor.close();
    }

    for (const colorScheme of ["light", "dark"] as const) {
      await page.emulateMedia({ colorScheme });
      await page.reload();
      await expect(page.getByRole("heading", { name: "Appearance", level: 2 })).toBeVisible();
      await expectAccessible(page);
    }
    expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
  } finally {
    // Other specs expect the template's own look.
    await page.goto("/appearance");
    await page.getByRole("button", { name: "Clean" }).click();
    await page.getByRole("textbox", { name: "What should the app be called?" }).fill(original);
    await page.getByRole("button", { name: "Save" }).click();
    await expect(page.getByRole("status").filter({ hasText: "The new look is saved" })).toBeVisible();
  }
});
