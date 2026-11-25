import {
  expect,
  type APIRequestContext,
  type Locator,
  type Page,
} from "@playwright/test";

export const mailpit = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
export const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "owner@example.test";
/** What the app is called until the owner renames it: cmd/server/main.go's DisplayName. */
export const appName = process.env.E2E_APP_NAME ?? "Roux App";
export const ownerName = process.env.E2E_OWNER_NAME ?? "Olive Owner";

interface MailpitSummary {
  ID: string;
  To: { Address: string }[];
}

async function messagesTo(
  request: APIRequestContext,
  address: string,
): Promise<string[]> {
  const response = await request.get(`${mailpit}/api/v1/messages`);
  expect(response.ok()).toBeTruthy();
  const { messages } = (await response.json()) as {
    messages: MailpitSummary[];
  };
  return messages
    .filter((m) =>
      m.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()),
    )
    .map((m) => m.ID);
}

const SIGN_IN_LINK = /https?:\/\/[^\s"'<>]+\/signin\/link#token=[^\s"'<>]+/;

/** The first match of the pattern in a message's text or HTML: the whole match, or group 1 if it has one. */
async function findIn(
  request: APIRequestContext,
  id: string,
  pattern: RegExp,
): Promise<string | undefined> {
  const response = await request.get(`${mailpit}/api/v1/message/${id}`);
  expect(response.ok()).toBeTruthy();
  const message = (await response.json()) as { Text?: string; HTML?: string };
  const body = `${message.Text ?? ""}\n${message.HTML ?? ""}`;
  const match = pattern.exec(body);
  return match?.[1] ?? match?.[0];
}

/** The IDs of the messages already in the address's inbox, so a later link is known to be new. */
export async function inboxSnapshot(
  request: APIRequestContext,
  address: string,
): Promise<Set<string>> {
  return new Set(await messagesTo(request, address));
}

/** Waits for a message to the address, not in `seen`, that matches the pattern, and returns the match. */
async function nextMatch(
  request: APIRequestContext,
  address: string,
  seen: Set<string>,
  pattern: RegExp,
  what: string,
  timeout: number,
): Promise<string> {
  let found: string | undefined;
  await expect
    .poll(
      async () => {
        for (const id of await messagesTo(request, address)) {
          if (!seen.has(id)) {
            found = await findIn(request, id, pattern);
            if (found) {
              return found;
            }
          }
        }
        return undefined;
      },
      { timeout, message: `${what} for ${address} in Mailpit` },
    )
    .toBeTruthy();
  return found!;
}

/** Waits for a sign-in link to the address in a message not in `seen`, and returns it. */
export async function nextSignInLink(
  request: APIRequestContext,
  address: string,
  seen: Set<string>,
  timeout = 15_000,
): Promise<string> {
  return nextMatch(
    request,
    address,
    seen,
    SIGN_IN_LINK,
    "a sign-in link",
    timeout,
  );
}

/**
 * Checks that every message to the address that is not in `seen` has the subject, and names the app
 * (`appName`) in its text and its HTML: roux's finished emails, not who's plain ones.
 */
export async function expectEmailsNameApp(
  request: APIRequestContext,
  address: string,
  seen: Set<string>,
  subject: string,
) {
  const ids = (await messagesTo(request, address)).filter(
    (id) => !seen.has(id),
  );
  expect(ids.length).toBeGreaterThan(0);
  const messages = await Promise.all(
    ids.map(async (id) => {
      const response = await request.get(`${mailpit}/api/v1/message/${id}`);
      expect(response.ok()).toBeTruthy();
      return (await response.json()) as {
        Subject?: string;
        Text?: string;
        HTML?: string;
      };
    }),
  );
  for (const message of messages) {
    expect(message.Subject).toBe(subject);
    expect(message.Text).toContain(appName);
    expect(message.HTML).toContain(appName);
  }
}

/** Opens an emailed link in the page, at the page's own base URL. */
export async function openLink(page: Page, link: string) {
  const url = new URL(link);
  await page.goto(url.pathname + url.search + url.hash);
}

/** Home's heading, where signing in lands unless the visitor was going somewhere. */
const HOME_HEADING = { name: /^Welcome/, level: 2 };

/**
 * Asks for a sign-in link on the sign-in page (already open), reads it from Mailpit and opens it
 * in the same tab. Signing in lands on Home, unless the visitor was sent to sign in from a page of
 * their own: then `landsOn` is that page's heading.
 */
export async function signInByLink(
  page: Page,
  request: APIRequestContext,
  address: string,
  landsOn: { name: string | RegExp; level: number } = HOME_HEADING,
) {
  await expect(
    page.getByRole("heading", { name: /^Sign in to /, level: 1 }),
  ).toBeVisible();
  const seen = await inboxSnapshot(request, address);
  await page.getByLabel("Email").fill(address);
  const ask = page.getByRole("button", { name: "Email me a link" });
  await ask.click();
  await expect(
    page.getByRole("heading", { name: "Check your email", level: 1 }),
  ).toBeVisible();
  let link: string;
  try {
    link = await nextSignInLink(request, address, seen, 5_000);
  } catch {
    // roux sends one email per address per resend interval (1s under run.sh); a request inside it
    // still answers 202 but sends nothing. Ask once more.
    await ask.click();
    link = await nextSignInLink(request, address, seen);
  }
  await openLink(page, link);
  await expect(
    page.getByRole("heading", { name: landsOn.name, level: landsOn.level }),
  ).toBeVisible();
}

/** Picks `item` from the account menu, at the foot of the sidebar. */
export async function fromAccount(page: Page, item: string) {
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Opens the Settings page from the account menu. */
export async function openSettings(page: Page) {
  await fromAccount(page, "Settings");
  await expect(
    page.getByRole("heading", { name: "Settings", level: 2 }),
  ).toBeVisible();
}

/**
 * Opens a dialog with its button and waits until it has finished opening. Typing during the open
 * animation can land in the wrong field: a dialog reopened while the last one is still animating
 * closed briefly has both mounted, and a label can point at the other's input.
 */
export async function openDialog(
  page: Page,
  button: string,
  dialogName: string,
): Promise<Locator> {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.evaluate((element) =>
    Promise.all(
      element.getAnimations({ subtree: true }).map((a) => a.finished),
    ),
  );
  return dialog;
}

/** The owner, signed in on `page`, invites `name` and returns the sign-in link the invitation sent. */
export async function invite(
  page: Page,
  request: APIRequestContext,
  name: string,
  email: string,
  role: "User" | "Instructor",
): Promise<string> {
  await page
    .getByRole("navigation", { name: "Main" })
    .getByRole("link", { name: "Users" })
    .click();
  const seen = await inboxSnapshot(request, email);
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Invitation sent" }),
  ).toBeVisible();
  await expect(dialog).toBeHidden();
  return nextSignInLink(request, email, seen);
}
