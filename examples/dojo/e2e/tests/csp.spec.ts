import { expect, test, type Page } from "@playwright/test";
import { ownerEmail, ownerName, signInByLink } from "./helpers";

declare global {
  interface Window {
    cspViolations: string[];
    injectedScriptRan?: boolean;
    modeAtParse?: string;
  }
}

/** Collects every Content-Security-Policy violation on the page, from before the page's own code. */
async function recordViolations(page: Page) {
  await page.addInitScript(() => {
    window.cspViolations = [];
    document.addEventListener("securitypolicyviolation", (event) =>
      window.cspViolations.push(`${event.effectiveDirective} ${event.blockedURI}`),
    );
  });
}

test("the app runs under its Content-Security-Policy without a violation", async ({ page, request }) => {
  await recordViolations(page);
  const response = await page.goto("/");
  expect(response?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
  await signInByLink(page, request, ownerEmail);

  const nav = page.getByRole("navigation", { name: "Main" });
  await nav.getByRole("link", { name: "Members" }).click();
  const table = page.getByRole("table", { name: "Members" });
  await expect(page.getByText(/^(Showing 1 to \d+ of \d+ rows|\d+ rows?)$/)).toBeVisible();
  await table.getByRole("button", { name: "Email" }).click();
  await expect(table.getByRole("columnheader", { name: "Email" })).toHaveAttribute("aria-sort", "ascending");
  await nav.getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  await page.getByRole("button", { name: /Switch to (dark|light) mode/ }).click();

  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Open navigation" }).click();
  await expect(page.getByRole("dialog", { name: "Navigation" })).toBeVisible();

  // A dialog, a toast and a member's page add styles of their own.
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto("/members");
  await page.getByRole("button", { name: "Invite member" }).click();
  await expect(page.getByRole("dialog", { name: "Invite a member" })).toBeVisible();
  await page.keyboard.press("Escape");
  await page.getByRole("table", { name: "Members" }).getByRole("link").first().click();
  await expect(page.getByRole("heading", { name: "History", level: 3 })).toBeVisible();
  await page.goto("/settings");
  await page.getByLabel("Display name").fill(`${ownerName}`);
  await page.getByRole("button", { name: "Save profile" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  expect(await page.evaluate(() => window.cspViolations)).toEqual([]);
});

test("a script injected into the page does not run", async ({ page }) => {
  await recordViolations(page);
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();

  await page.evaluate(() => {
    const script = document.createElement("script");
    script.textContent = "window.injectedScriptRan = true;";
    document.body.append(script);
  });

  expect(await page.evaluate(() => window.injectedScriptRan)).toBeUndefined();
  expect(await page.evaluate(() => window.cspViolations)).toEqual([expect.stringMatching(/^script-src-elem inline/)]);
});

test("dark mode is set as the page is parsed, before the app starts", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("theme", "dark");
    document.addEventListener("readystatechange", () => {
      if (document.readyState === "interactive") {
        window.modeAtParse = document.documentElement.className;
      }
    });
  });
  await page.goto("/signin");
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();

  expect(await page.evaluate(() => window.modeAtParse)).toContain("dark");
});
