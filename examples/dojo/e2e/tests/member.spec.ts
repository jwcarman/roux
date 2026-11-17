import { expect, test } from "@playwright/test";
import { inboxSnapshot, nextSignInLink, openDialog, openLink, ownerEmail, signInByLink } from "./helpers";

test("an invited member signs in by link, sees the directory, and cannot invite", async ({
  browser,
  page,
  request,
}) => {
  const member = `member-${Date.now()}@dojo.test`;

  // The owner invites the member from the Members page.
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);

  const seen = await inboxSnapshot(request, member);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" }).click();
  await expect(page.getByRole("heading", { name: "Members", level: 2 })).toBeVisible();
  const dialog = await openDialog(page, "Invite member", "Invite a member");
  await dialog.getByLabel("Name").fill("Ada Lovelace");
  await dialog.getByLabel("Email").fill(member);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  // The new member is in the directory at once.
  await expect(page.getByRole("cell", { name: "Ada Lovelace", exact: true })).toBeVisible();
  const link = await nextSignInLink(request, member, seen);

  // The member accepts in a browser of their own.
  const memberContext = await browser.newContext();
  const memberPage = await memberContext.newPage();
  await openLink(memberPage, link);
  await expect(memberPage.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();
  await expect(memberPage.getByText("Welcome, Ada Lovelace")).toBeVisible();

  // A member sees the directory, with themselves in it, but no invite form.
  await memberPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Members" }).click();
  await expect(memberPage.getByRole("heading", { name: "Members", level: 2 })).toBeVisible();
  await expect(memberPage.getByRole("cell", { name: "Ada Lovelace", exact: true })).toBeVisible();
  await expect(memberPage.getByRole("heading", { name: "Invite a member" })).toHaveCount(0);
  await expect(memberPage.getByRole("button", { name: "Invite member" })).toHaveCount(0);

  // And the invitation API refuses the member's own session. The request carries the page's own CSRF
  // header, so the 403 is the permission check, not CSRF.
  const statuses = await memberPage.evaluate(async () => {
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
      invitation: await post("/api/members/invitations", {
        name: "Someone Else",
        email: "someone-else@dojo.test",
      }),
    };
  });
  expect(statuses).toEqual({ token: true, invitation: 403 });

  // The member renames themselves; the header follows.
  await memberPage.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(memberPage.getByLabel("Email")).toHaveValue(member);
  await memberPage.getByLabel("Display name").fill("Ada King");
  await memberPage.getByRole("button", { name: "Save profile" }).click();
  await expect(memberPage.getByRole("status").filter({ hasText: "Profile saved" })).toBeVisible();
  await expect(
    memberPage.getByRole("region", { name: "Account" }).getByText("Ada King", { exact: true }),
  ).toBeVisible();

  // The owner finds the member under the new name.
  await page.reload();
  await page.getByLabel("Search members").fill("ada");
  const table = page.getByRole("table", { name: "Members" });
  await expect(table.getByRole("cell", { name: "Ada King", exact: true })).toBeVisible();
  await expect(table.getByRole("cell", { name: "Ada Lovelace", exact: true })).toHaveCount(0);
  await expect(table.getByRole("row")).toHaveCount(2); // the header row and Ada

  await memberContext.close();
});
