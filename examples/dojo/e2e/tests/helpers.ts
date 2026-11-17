import { expect, type APIRequestContext, type CDPSession, type Locator, type Page } from "@playwright/test";

export const mailpit = process.env.E2E_MAILPIT_URL ?? "http://localhost:8025";
export const ownerEmail = process.env.E2E_OWNER_EMAIL ?? "owner@dojo.test";
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

/** Opens an emailed link in the page, at the page's own base URL. */
export async function openLink(page: Page, link: string) {
  const url = new URL(link);
  await page.goto(url.pathname + url.search + url.hash);
}

/**
 * Asks for a sign-in link on the sign-in page (already open), reads it from Mailpit and opens it
 * in the same tab.
 */
export async function signInByLink(page: Page, request: APIRequestContext, address: string) {
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
  const seen = await inboxSnapshot(request, address);
  await page.getByLabel("Email").fill(address);
  const ask = page.getByRole("button", { name: "Email me a link" });
  await ask.click();
  await expect(page.getByRole("status").filter({ hasText: "Check your email" })).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();
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
  await page.route("**/who/passkey/register/options", async (route) => {
    const response = await route.fetch();
    const options = await response.json();
    options.pubKeyCredParams = [{ type: "public-key", alg }];
    await route.fulfill({ response, json: options });
  });
}

/** Adds a passkey on the Settings page, reached through the app's own navigation. */
export async function registerPasskey(page: Page, label: string) {
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Settings" }).click();
  await expect(page.getByRole("heading", { name: "Settings", level: 2 })).toBeVisible();
  await page.getByLabel("Passkey label").fill(label);
  await page.getByRole("button", { name: "Add a passkey" }).click();
  await expect(page.getByRole("status").filter({ hasText: "Passkey added" })).toBeVisible();
  await expect(page.getByRole("cell", { name: label, exact: true })).toBeVisible();
}

export async function signOut(page: Page) {
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();
}

export async function signInWithPasskey(page: Page) {
  await page.getByRole("button", { name: "Sign in with a passkey" }).click();
  await expect(page.getByRole("heading", { name: "Home", level: 2 })).toBeVisible();
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
