import {
  expect,
  type APIRequestContext,
  type Browser,
  type CDPSession,
  type Locator,
  type Page,
} from "@playwright/test";

export const mailpit = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
export const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "owner@example.test";
/**
 * What the app is called until the owner renames it: application.yml's `roux.theme.app-name`, which
 * E2eIT reads and passes on.
 */
export const appName = required("E2E_APP_NAME");
export const ownerName = process.env.E2E_OWNER_NAME ?? "Olive Owner";

/** COSE algorithm ids. */
export const P256 = -7;
export const ED25519 = -8;

interface MailpitSummary {
  ID: string;
  To: { Address: string }[];
}

async function messagesTo(request: APIRequestContext, address: string): Promise<string[]> {
  const response = await request.get(`${mailpit}/api/v1/messages`);
  expect(response.ok()).toBeTruthy();
  const { messages } = (await response.json()) as { messages: MailpitSummary[] };
  return messages
    .filter((m) => m.To.some((to) => to.Address.toLowerCase() === address.toLowerCase()))
    .map((m) => m.ID);
}

const SIGN_IN_LINK = /https?:\/\/[^\s"'<>]+\/signin\/link#token=[^\s"'<>]+/;
const SIGN_IN_CODE = /enter this code: ([0-9A-Z]+-[0-9A-Z]+)/;

/** The first match of the pattern in a message's text or HTML: the whole match, or group 1 if it has one. */
async function findIn(request: APIRequestContext, id: string, pattern: RegExp): Promise<string | undefined> {
  const response = await request.get(`${mailpit}/api/v1/message/${id}`);
  expect(response.ok()).toBeTruthy();
  const message = (await response.json()) as { Text?: string; HTML?: string };
  const body = `${message.Text ?? ""}\n${message.HTML ?? ""}`;
  const match = body.match(pattern);
  return match?.[1] ?? match?.[0];
}

/** The IDs of the messages already in the address's inbox, so a later link is known to be new. */
export async function inboxSnapshot(request: APIRequestContext, address: string): Promise<Set<string>> {
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
  return nextMatch(request, address, seen, SIGN_IN_LINK, "a sign-in link", timeout);
}

/** Waits for a typed sign-in code (as the email shows it, `K7F-2QM`) in a message not in `seen`. */
export async function nextSignInCode(
  request: APIRequestContext,
  address: string,
  seen: Set<string>,
  timeout = 15_000,
): Promise<string> {
  return nextMatch(request, address, seen, SIGN_IN_CODE, "a sign-in code", timeout);
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
  const ids = (await messagesTo(request, address)).filter((id) => !seen.has(id));
  expect(ids.length).toBeGreaterThan(0);
  for (const id of ids) {
    const response = await request.get(`${mailpit}/api/v1/message/${id}`);
    expect(response.ok()).toBeTruthy();
    const message = (await response.json()) as { Subject?: string; Text?: string; HTML?: string };
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

/**
 * Asks for a sign-in link on the sign-in page (already open), reads it from Mailpit and opens it
 * in the same tab. Signing in lands on Home, unless the visitor was sent to sign in from a page of
 * their own: then `landsOn` is that page's heading.
 */
export async function signInByLink(
  page: Page,
  request: APIRequestContext,
  address: string,
  landsOn: { name: string | RegExp; level: number } = { name: /^Welcome/, level: 2 },
) {
  await expect(page.getByRole("heading", { name: /^Sign in to /, level: 1 })).toBeVisible();
  const seen = await inboxSnapshot(request, address);
  await page.getByLabel("Email").fill(address);
  const ask = page.getByRole("button", { name: "Email me a link" });
  await ask.click();
  await expect(page.getByRole("heading", { name: "Check your email", level: 1 })).toBeVisible();
  let link: string;
  try {
    link = await nextSignInLink(request, address, seen, 5_000);
  } catch {
    // who sends one email per address per resend interval (1s in E2eIT); a request inside it
    // still answers 202 but sends nothing. Ask once more.
    await ask.click();
    link = await nextSignInLink(request, address, seen);
  }
  await openLink(page, link);
  await expect(page.getByRole("heading", { name: landsOn.name, level: landsOn.level })).toBeVisible();
}

/** Chrome's virtual authenticator, standing in for Touch ID: it creates and uses real passkeys. */
export async function virtualAuthenticator(
  page: Page,
): Promise<{ cdp: CDPSession; authenticatorId: string }> {
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: {
      protocol: "ctap2",
      transport: "internal",
      hasResidentKey: true,
      hasUserVerification: true,
      isUserVerified: true,
    },
  });
  return { cdp, authenticatorId };
}

/**
 * The key type of each passkey the virtual authenticator holds, read from its PKCS#8 private key:
 * the Ed25519 OID (1.3.101.112) or the EC public key OID (1.2.840.10045.2.1, which P-256 uses).
 */
export async function heldPasskeys(cdp: CDPSession, authenticatorId: string): Promise<string[]> {
  const { credentials } = await cdp.send("WebAuthn.getCredentials", { authenticatorId });
  return credentials.map((c) => {
    const key = Buffer.from(c.privateKey, "base64").toString("hex");
    if (key.includes("06032b6570")) {
      return "Ed25519";
    }
    if (key.includes("06072a8648ce3d0201")) {
      return "P-256";
    }
    return "unknown";
  });
}

/** Offers the authenticator only one key algorithm when a passkey is registered. */
export async function onlyAlgorithm(page: Page, alg: number) {
  await page.route("**/who/me/passkeys/options", async (route) => {
    const response = await route.fetch();
    const options = await response.json();
    options.pubKeyCredParams = [{ type: "public-key", alg }];
    await route.fulfill({ response, json: options });
  });
}

/** Picks `item` from the account menu, at the foot of the sidebar. */
export async function fromAccount(page: Page, item: string) {
  await page.getByRole("button", { name: "Account" }).click();
  await page.getByRole("menuitem", { name: item }).click();
}

/** Opens the Settings page from the account menu. */
export async function openSettings(page: Page) {
  await fromAccount(page, "Settings");
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
}

/** Adds a passkey on the Settings page, reached through the account menu. */
export async function registerPasskey(page: Page, label: string) {
  await openSettings(page);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  const dialog = page.getByRole("dialog", { name: "Add a passkey" });
  await dialog.getByLabel("Passkey label").fill(label);
  await dialog.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added" })).toBeVisible();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole("list", { name: "Passkeys" }).getByText(label, { exact: true })).toBeVisible();
}

export async function signOut(page: Page) {
  await fromAccount(page, "Sign out");
  await expect(page.getByRole("heading", { name: /^Sign in to /, level: 1 })).toBeVisible();
}

export async function signInWithPasskey(page: Page) {
  await page.getByRole("button", { name: "Use a passkey" }).click();
  await expect(page.getByRole("heading", { name: /^Welcome/, level: 2 })).toBeVisible();
}

/**
 * Opens a dialog with its button and waits until it has finished opening. Typing during the open
 * animation can land in the wrong field: a dialog reopened while the last one is still animating
 * closed briefly has both mounted, and a label can point at the other's input.
 */
export async function openDialog(page: Page, button: string, dialogName: string): Promise<Locator> {
  await page.getByRole("button", { name: button }).click();
  const dialog = page.getByRole("dialog", { name: dialogName });
  await expect(dialog).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCount(1);
  await dialog.evaluate((element) => Promise.all(element.getAnimations({ subtree: true }).map((a) => a.finished)));
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
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  const seen = await inboxSnapshot(request, email);
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByLabel("Role").selectOption({ label: role });
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Invitation sent" })).toBeVisible();
  await expect(dialog).toBeHidden();
  return nextSignInLink(request, email, seen);
}

/** A browser of its own, signed in through `link`, on the home page. */
export async function signedInThrough(browser: Browser, link: string) {
  const context = await browser.newContext();
  const page = await context.newPage();
  await openLink(page, link);
  await expect(page.getByRole("heading", { name: /^Welcome/, level: 2 })).toBeVisible();
  return { context, page };
}

function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`${name} is not set: run the suite through E2eIT (./mvnw verify)`);
  }
  return value;
}
