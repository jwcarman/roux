import { expect, test, type Page } from "@playwright/test";
import { inboxSnapshot, nextSignInCode, ownerEmail } from "./helpers";

/**
 * Posts a typed code to who's sign-in endpoint from the page, as a form for the code would, with
 * the CSRF header the SPA sends. The app has no code form yet; this proves who's side of it.
 */
async function postCode(page: Page, email: string, code: string): Promise<number> {
  return page.evaluate(
    async ({ email, code }) => {
      const cookie = document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="));
      const token = cookie === undefined ? "" : decodeURIComponent(cookie.slice("XSRF-TOKEN=".length));
      const response = await fetch("/who/email/sign-in", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json", "X-XSRF-TOKEN": token },
        body: JSON.stringify({ email, code }),
      });
      return response.status;
    },
    { email, code },
  );
}

test("the owner signs in with the code from the email instead of the link", async ({ page, request }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  const seen = await inboxSnapshot(request, ownerEmail);
  await page.getByLabel("Email").fill(ownerEmail);
  const ask = page.getByRole("button", { name: "Email me a link" });
  await ask.click();
  await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
  let code: string;
  try {
    code = await nextSignInCode(request, ownerEmail, seen, 5_000);
  } catch {
    // one email per address per resend interval (1s in E2eIT); ask once more
    await ask.click();
    code = await nextSignInCode(request, ownerEmail, seen);
  }

  // A wrong code is refused and costs one attempt; the right one still works afterwards.
  const wrong = code.startsWith("0") ? "1" + code.slice(1) : "0" + code.slice(1);
  expect(await postCode(page, ownerEmail, wrong)).toBe(401);

  // Typed the way a person might: lower case, the dash kept.
  expect(await postCode(page, ownerEmail, code.toLowerCase())).toBe(200);

  await page.goto("/");
  await expect(page.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();

  // The code worked once; the same code again is refused.
  expect(await postCode(page, ownerEmail, code)).toBe(401);
});
