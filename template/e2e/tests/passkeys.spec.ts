import { expect, test, type CDPSession, type Page } from "@playwright/test";
import { openSettings, ownerEmail, signInByLink } from "./helpers";

// Not part of roux's own suite: it drives the real front end with a virtual authenticator
// (what Chromium offers instead of a physical key), so passkeys are tried end to end:
// register from Settings, sign out, sign in with the passkey, remove it.
//
// The server must run with PASSKEY_RP_ID=localhost and PASSKEY_ORIGINS=http://localhost:8080.

async function virtualAuthenticator(page: Page): Promise<CDPSession> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
      automaticPresenceSimulation: true,
    },
  });
  return cdp;
}

test("a passkey is added in Settings, signs the person in, and can be removed", async ({ page, request }) => {
  await virtualAuthenticator(page);

  // Registering needs a recent sign-in, so start with the emailed link.
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await openSettings(page);

  const label = `Test laptop ${Date.now()}`;
  await expect(page.getByText("No passkeys yet.")).toBeVisible();

  await page.getByRole("button", { name: "Add a passkey" }).click();
  await page.getByLabel("Passkey label").fill(label);
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added" })).toBeVisible();
  await expect(page.getByText(label)).toBeVisible();

  // Sign out, then sign in with nothing but the passkey.
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: /^Sign in to /, level: 1 })).toBeVisible();

  await page.getByRole("button", { name: "Use a passkey" }).click();
  await expect(page.getByRole("heading", { name: /^Welcome/, level: 2 })).toBeVisible();

  // Remove it. This session signed in with that very passkey, so removing it ends the session
  // (who's rule): the page lands back on sign-in.
  await openSettings(page);
  await expect(page.getByText(label)).toBeVisible();
  await page.getByRole("button", { name: `Remove ${label}` }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey removed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: /^Sign in to /, level: 1 })).toBeVisible();

  // The passkey is gone: signing in by link shows an empty list again.
  await signInByLink(page, request, ownerEmail);
  await openSettings(page);
  await expect(page.getByText("No passkeys yet.")).toBeVisible();
  await expect(page.getByText(label)).toHaveCount(0);
});
