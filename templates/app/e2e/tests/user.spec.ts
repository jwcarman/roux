import { expect, test } from "@playwright/test";
import { appName, expectEmailsNameApp, inboxSnapshot, nextSignInLink, openDialog, openLink, openSettings, ownerEmail, signInByLink } from "./helpers";

test("an invited user signs in by link, sees the directory, and cannot invite", async ({
  browser,
  page,
  request,
}) => {
  const user = `user-${Date.now()}@example.test`;

  // The owner invites the user from the Users page.
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  const seen = await inboxSnapshot(request, user);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  await expect(page.getByRole("heading", { name: "Users", level: 2 })).toBeVisible();
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill("Ada Lovelace");
  await dialog.getByLabel("Email").fill(user);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  // The new user is in the directory at once.
  await expect(page.getByRole("cell", { name: "Ada Lovelace", exact: true })).toBeVisible();
  const link = await nextSignInLink(request, user, seen);

  // The invitation is roux's: the app's name in its subject and in both bodies.
  await expectEmailsNameApp(request, user, seen, `You've been invited to ${appName}`);

  // The user accepts in a browser of their own.
  const userContext = await browser.newContext();
  const userPage = await userContext.newPage();
  await openLink(userPage, link);
  await expect(userPage.getByRole("heading", { name: "Welcome, Ada Lovelace", level: 2 })).toBeVisible();

  // A user sees the directory, with themselves in it, but no invite form.
  await userPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  await expect(userPage.getByRole("heading", { name: "Users", level: 2 })).toBeVisible();
  await expect(userPage.getByRole("cell", { name: "Ada Lovelace", exact: true })).toBeVisible();
  await expect(userPage.getByRole("heading", { name: "Invite a user" })).toHaveCount(0);
  await expect(userPage.getByRole("button", { name: "Invite user" })).toHaveCount(0);

  // And the invitation API refuses the user's own session. The request carries the page's own CSRF
  // header, so the 403 is the permission check, not CSRF.
  const statuses = await userPage.evaluate(async () => {
    const token = document.cookie
      .split("; ")
      .find((c) => c.startsWith("XSRF-TOKEN="))
      ?.slice("XSRF-TOKEN=".length);
    const post = async (path: string, body: unknown) =>
      (
        await fetch(path, {
          method: "POST",
          credentials: "same-origin",
          headers: {
            Accept: "application/json",
            "Content-Type": "application/json",
            "X-XSRF-TOKEN": token ?? "",
          },
          body: JSON.stringify(body),
        })
      ).status;
    return {
      token: token !== undefined && token.length > 0,
      invitation: await post("/api/users/invitations", {
        name: "Someone Else",
        email: "someone-else@example.test",
        role: "USER",
      }),
    };
  });
  expect(statuses).toEqual({ token: true, invitation: 403 });

  // The user renames themselves; the header follows.
  await openSettings(userPage);
  await expect(userPage.getByLabel("Email")).toHaveValue(user);
  await userPage.getByLabel("Display name").fill("Ada King");
  await userPage.getByRole("button", { name: "Save profile" }).click();
  await expect(userPage.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  await expect(
    userPage.getByRole("region", { name: "Account" }).getByText("Ada King", { exact: true }),
  ).toBeVisible();

  // The owner finds the user under the new name.
  await page.reload();
  await page.getByLabel("Search users").fill("ada");
  const table = page.getByRole("table", { name: "Users" });
  await expect(table.getByRole("cell", { name: "Ada King", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Ada Lovelace", exact: true })).toHaveCount(0);
  await expect(table.getByRole("row")).toHaveCount(2); // the header row and Ada

  await userContext.close();
});
