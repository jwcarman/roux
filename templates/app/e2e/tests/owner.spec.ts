import { expect, test } from "@playwright/test";
import {
  ED25519,
  heldPasskeys,
  onlyAlgorithm,
  ownerEmail,
  P256,
  registerPasskey,
  signInByLink,
  signInWithPasskey,
  signOut,
  virtualAuthenticator,
} from "./helpers";

test("the owner signs in by link, adds a P-256 passkey, and signs in with it", async ({
  page,
  request,
}) => {
  const { cdp, authenticatorId } = await virtualAuthenticator(page);
  await onlyAlgorithm(page, P256);

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  await registerPasskey(page, "Laptop (P-256)");
  expect(await heldPasskeys(cdp, authenticatorId)).toEqual(["P-256"]);

  await signOut(page);
  await signInWithPasskey(page);

  // The same tab, never reloaded: each POST must read the CSRF cookie afresh, because passkey
  // sign-in rotated it and sign-out cleared it.
  await signOut(page);
  await signInByLink(page, request, ownerEmail);
});

test("the owner adds an Ed25519 passkey and signs in with it", async ({ page, request }) => {
  const { cdp, authenticatorId } = await virtualAuthenticator(page);
  await onlyAlgorithm(page, ED25519);

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  await registerPasskey(page, "Security key (Ed25519)");
  expect(await heldPasskeys(cdp, authenticatorId)).toEqual(["Ed25519"]);

  await signOut(page);
  await signInWithPasskey(page);
});

test("a passkey the owner removes can no longer sign in", async ({ page, request }) => {
  const { cdp, authenticatorId } = await virtualAuthenticator(page);

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await registerPasskey(page, "Lost phone");

  await page.getByRole("button", { name: "Remove Lost phone" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey removed" })).toBeVisible();
  await expect(page.getByRole("cell", { name: "Lost phone", exact: true })).toHaveCount(0);

  // The browser still holds the passkey; the server no longer accepts it.
  expect(await heldPasskeys(cdp, authenticatorId)).toHaveLength(1);
  await signOut(page);
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert")).toHaveText("Passkey sign-in failed.");
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
});

test("removing the passkey this session signed in with signs the owner out", async ({
  page,
  request,
}) => {
  await virtualAuthenticator(page);

  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await registerPasskey(page, "Only device");
  await signOut(page);
  await signInWithPasskey(page);

  // who resolves the session through its credential on every request, so revoking that
  // credential ends the session at once. The app must notice and send the owner to sign in.
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await page.getByRole("button", { name: "Remove Only device" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  await expect(page.getByRole("button", { name: "Sign out" })).toHaveCount(0);

  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("alert")).toHaveText("Passkey sign-in failed.");
});
