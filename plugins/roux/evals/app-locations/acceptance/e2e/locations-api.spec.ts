// The eval's hidden check of the locations API contract in the case's prompt; the agent never sees
// it. Black box, over HTTP against the running app, so it holds whatever the run named its Go code.
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";
import {
  inboxSnapshot,
  nextSignInLink,
  openDialog,
  openLink,
  ownerEmail,
  signInByLink,
} from "./helpers";

type Location = { id: string; name: string; kind: string; version: number };

/** Requests as the person signed in on the page, with the CSRF header roux asks of a change. */
function api(context: BrowserContext) {
  const csrf = async () => {
    const cookie = (await context.cookies()).find((c) => c.name === "XSRF-TOKEN");
    return cookie ? { "X-XSRF-TOKEN": cookie.value } : {};
  };
  return {
    get: (path: string) => context.request.get(path),
    post: async (path: string, data: unknown) =>
      context.request.post(path, { data, headers: await csrf() }),
    put: async (path: string, data: unknown) =>
      context.request.put(path, { data, headers: await csrf() }),
  };
}

async function asOwner(page: Page, request: APIRequestContext) {
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  return api(page.context());
}

/** The owner invites someone (a USER, the invitation's default role); they sign in in a browser of their own. */
async function asMember(browser: Browser, page: Page, request: APIRequestContext) {
  const tag = Date.now().toString(36) + Math.floor(Math.random() * 1000);
  const email = `max.${tag}@example.test`;
  await page.goto("/");
  await signInByLink(page, request, ownerEmail);
  await page.getByRole("navigation", { name: "Main" }).getByRole("link", { name: "Users" }).click();
  const seen = await inboxSnapshot(request, email);
  const dialog = await openDialog(page, "Invite user", "Invite a user");
  await dialog.getByLabel("Name").fill(`Max ${tag}`);
  await dialog.getByLabel("Email").fill(email);
  await dialog.getByRole("button", { name: "Send invitation" }).click();
  await expect(dialog).toBeHidden();
  const link = await nextSignInLink(request, email, seen);
  const context = await browser.newContext();
  const memberPage = await context.newPage();
  await openLink(memberPage, link);
  await expect(memberPage.getByRole("heading", { name: /^Welcome/, level: 2 })).toBeVisible();
  return api(context);
}

async function nameIsRefused(response: APIResponse) {
  expect(response.status(), await response.text()).toBe(400);
  const body = (await response.json()) as { errors?: { field?: string }[] };
  expect(body.errors?.some((e) => e.field === "name"), JSON.stringify(body)).toBe(true);
}

const unique = () => Date.now().toString(36) + Math.floor(Math.random() * 1000);

test("the owner adds a location and sees it listed", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  const name = `Central ${unique()}`;
  const created = await owner.post("/api/locations", { name, kind: "MAIN_DOJO" });
  expect(created.status(), await created.text()).toBe(201);
  const location = (await created.json()) as Location;
  expect(location.id).toBeTruthy();
  expect(location.name).toBe(name);
  expect(location.kind).toBe("MAIN_DOJO");
  expect(typeof location.version).toBe("number");

  const listed = await owner.get("/api/locations");
  expect(listed.status()).toBe(200);
  const all = (await listed.json()) as Location[];
  expect(all.find((l) => l.name === name)?.kind).toBe("MAIN_DOJO");
});

test("the list is sorted by name", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  const tag = unique();
  for (const [name, kind] of [
    [`Mid ${tag}`, "SATELLITE"],
    [`Alpha ${tag}`, "OUTDOOR"],
    [`Zulu ${tag}`, "MAIN_DOJO"],
  ]) {
    expect((await owner.post("/api/locations", { name, kind })).status()).toBe(201);
  }
  const names = ((await (await owner.get("/api/locations")).json()) as Location[]).map((l) => l.name);
  expect(names).toEqual([...names].sort((a, b) => (a < b ? -1 : a > b ? 1 : 0)));
  expect(names.filter((n) => n.endsWith(tag))).toEqual([`Alpha ${tag}`, `Mid ${tag}`, `Zulu ${tag}`]);
});

test("the owner edits a location", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  const tag = unique();
  const created = (await (
    await owner.post("/api/locations", { name: `Harbour ${tag}`, kind: "SATELLITE" })
  ).json()) as Location;
  const changed = await owner.put(`/api/locations/${created.id}`, {
    name: `Riverside ${tag}`,
    kind: "OUTDOOR",
    version: created.version,
  });
  expect(changed.status(), await changed.text()).toBe(200);
  const location = (await changed.json()) as Location;
  expect(location.name).toBe(`Riverside ${tag}`);
  expect(location.kind).toBe("OUTDOOR");

  const all = (await (await owner.get("/api/locations")).json()) as Location[];
  expect(all.find((l) => l.id === created.id)?.name).toBe(`Riverside ${tag}`);
});

test("a blank name is refused on the name field", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  await nameIsRefused(await owner.post("/api/locations", { name: "   ", kind: "OUTDOOR" }));
});

test("a name of forty characters is taken and forty-one is refused", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  const forty = `F${unique()}`.padEnd(40, "x");
  expect((await owner.post("/api/locations", { name: forty, kind: "OUTDOOR" })).status()).toBe(201);
  await nameIsRefused(await owner.post("/api/locations", { name: `${forty.slice(0, 39)}yz`, kind: "OUTDOOR" }));
});

test("another location's name is refused on the name field", async ({ page, request }) => {
  const owner = await asOwner(page, request);
  const name = `Twin ${unique()}`;
  expect((await owner.post("/api/locations", { name, kind: "MAIN_DOJO" })).status()).toBe(201);
  await nameIsRefused(await owner.post("/api/locations", { name, kind: "OUTDOOR" }));
});

test("someone who is not the owner cannot list locations", async ({ browser, page, request }) => {
  const member = await asMember(browser, page, request);
  expect((await member.get("/api/locations")).status()).toBe(403);
});

test("someone who is not the owner cannot add a location", async ({ browser, page, request }) => {
  const member = await asMember(browser, page, request);
  const response = await member.post("/api/locations", { name: `Nope ${unique()}`, kind: "OUTDOOR" });
  expect(response.status()).toBe(403);
});
