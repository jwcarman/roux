# Testing

A roux app is tested at three levels, each against the real thing as far as it can be:

- **Go:** each feature's endpoints over a real PostgreSQL, with roux's sign-in, permissions and
  problems, through an HTTP test server (`rouxtest`). Tests sign in as a person in a role and
  assert the Problem Details the browser will read.
- **Vitest with MSW:** components, forms and routes in jsdom, against a fake network that answers
  with the shapes roux's server sends, refusals included.
- **Playwright:** the built app in a browser, signing in by email link, including a
  Content-Security-Policy test.

The helpers come from roux: `rouxtest` (and `authntest`, `pgtest`) for Go, and
`@jwcarman/roux-web/testing` for the browser. The app keeps one helper of its own, `renderRoute`,
because it needs the app's route tree.

## Dependencies

Go's tests need nothing beyond the `github.com/jwcarman/roux` module: `rouxtest`, `authntest` and
`pgtest` are packages in it, and they use the standard `testing` package (no assertion library).
The frontend's `package.json` has, as dev dependencies: `vitest`, `jsdom`, `msw`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; Playwright
(`@playwright/test`) lives in its own `e2e/` package.

## Go: a feature over PostgreSQL

Tests run the feature as it runs in the app: its migrations after roux's, its routes behind the
real guard, its errors answered by roux, on PostgreSQL. Nothing is mocked.

### The database

`pgtest` gives each test a fresh schema of its own on one PostgreSQL:

- with `TEST_DATABASE_URL` set (`postgres://app:app@localhost:5432/app`), that database;
- otherwise a PostgreSQL container (`postgres:17-alpine`) started once per test package, on first
  use, which needs Docker.

A schema is named for the test (`rouxtest.New(t, "labels")`), dropped if an earlier run left one,
and the pool's `search_path` is set to it, so tests never see each other's rows. Use a different
name in each test package that runs at the same time.

### The app: `rouxtest.New`

```go
// setup is the labels API over a fresh schema, with Olive (OWNER) and Ada (USER) signed in.
func setup(t *testing.T) (owner, user *authntest.Browser) {
	t.Helper()
	a := rouxtest.New(t, "labels")
	a.Role("USER") // the app's own role, before labels grants to it
	a.Migrate(labels.Module{}.Migrations()...)
	labels.Register(a.Kit(), labels.Service{Pool: a.Pool, Clock: a.Clock.Now})
	a.Serve()
	return a.SignedIn(a.Person("Olive Owner", "OWNER")), a.SignedIn(a.Person("Ada Lovelace", "USER"))
}
```

- `rouxtest.New(t, schema, migrations...)` migrates roux's tables (identities, roles, sign-in by
  email, users, the activity log) and any migrations passed into a fresh schema.
- `a.Role(name, permissions...)` makes a role if there is none of that name and grants it the
  permissions. `OWNER` exists already. Make the app's own roles (`USER`) **before** migrating a
  feature whose migration grants to them, as the app's `app-roles` migration does.
- `a.Migrate(migrations...)` runs more migrations: the feature's.
- `a.Kit()` is the kit the feature's `Register` mounts its routes on (`Kit.Handle` and the rest),
  with the test's pool; `a.Serve()` starts the HTTP test server. Register every route before it.
- `a.Person(name, role)` makes a member of the team (an identity, a user named `name`, an address,
  the role) and returns their id. `a.Deactivate(id)` deactivates them and ends their sessions.
- `a.SignedIn(id)` is a browser signed in as them; `a.Browser()` is a signed-out one.
- `a.Pool` is the database, for arranging rows a test needs and checking what was stored.

### Signed-in browsers

`rouxtest.App` embeds an `authntest.Env` (the pool, the clock, the test server). A browser
(`*authntest.Browser`) keeps its cookies, and sends the CSRF token on every unsafe
request, as roux-web's client does:

```go
added := owner.Post("/api/labels", map[string]any{"name": " Urgent ", "colour": "yellow"}).
	Want(t, 201, "add").JSON(t)
```

- `Get(path)`, `Post(path, body)`, `Put(path, body)` and `Delete(path)` send JSON;
  `Do(method, path, body, csrf)` sends one without the CSRF token, to test that refusal.
- `Want(t, status, what)` fails the test, naming `what` and showing the answer, unless the status is
  the one wanted, and returns the reply (an `authntest.Reply`).
- `JSON(t)` is the body as a `map[string]any` (numbers are `float64`); `Decode(t, &v)` reads it
  into a struct.

### Time

`a.Clock` starts at 2026-11-24 12:00 UTC. Pass `a.Clock.Now` as the service's clock, and move it
with `a.At(moment)` or `a.Clock.Advance(d)`. Sessions expire on the same clock: moving it hours or
weeks ahead signs everyone out, and the next request is `401`. Sign the person in again after
moving it.

### What to test

One test per behaviour, named for it, and one per refusal, asserting its status and its words:

```go
func TestTwoLabelsMayNotShareANameIgnoringCase(t *testing.T) {
	owner, _ := setup(t)
	owner.Post("/api/labels", map[string]any{"name": "Waiting", "colour": "yellow"}).Want(t, 201, "first")
	got := owner.Post("/api/labels", map[string]any{"name": "WAITING", "colour": "green"}).Want(t, 400, "second").JSON(t)
	if errs := got["errors"].([]any); errs[0].(map[string]any)["message"] != labels.NameTaken {
		t.Fatalf("got %v", got)
	}
}
```

- **Every route's permission**: a person without it gets `403`, and one signed out `401`.
- **Every field the input checks**, and every refusal the service makes: `400` with the field and
  its message, `404`, `409` for a stale version.
- **What the list returns** for each filter, sort and search, and what the service stored.
- A test of a feature's own words names its constant (`labels.NameTaken`), and of roux's words
  roux's (`problem.MustNotBeBlank`), so a change of wording is made in one place.

### The app's own tests

`cmd/server` holds the tests of the app as a whole: the permissions file and the grants
([Roles and permissions](roles.md#the-permissions-tests)), that `compose.yaml` and the `Dockerfile`
use pinned releases, and that the front end is embedded. `make test` runs every package with
coverage (`coverage.out`).

## Vitest with MSW

Component, form and route tests run in Vitest. They render the real component with roux's query
client and answer its requests with MSW (Mock Service Worker); nothing in the app is mocked. The kit
is `@jwcarman/roux-web/testing`: `msw`, `@testing-library/react`, `@testing-library/jest-dom` and
`vitest` are its optional peers, the dev dependencies above, and no other roux-web entry imports them,
so none of it reaches the app's bundle.

The app's setup file is one line, `src/testing/setup.ts`:

```ts
import "@jwcarman/roux-web/testing/setup";
```

and the test section of `vite.config.ts` lists it (import roux's setup from a file of the app's, not by
its package name in `setupFiles`: so it shares the app's modules, and TypeScript sees jest-dom's
matchers):

```ts
// Tests run in Node; a component or route test opts into jsdom with a `@vitest-environment jsdom` docblock.
test: { environment: "node", include: ["src/**/*.test.{ts,tsx}"], setupFiles: ["src/testing/setup.ts"] },
```

roux's setup adds jest-dom's matchers, starts the fake network before the tests, sets the organization's
context before each test (one fixed organization and day, [Dates and time](dates-and-time.md#test)), and
after each test waits for the requests still in flight, unmounts, drops the test's handlers and fails
the test if a request went unanswered. It also gives jsdom what Chakra reaches for (`matchMedia`,
`ResizeObserver`, `scrollTo`).

### The fake network

`server` is MSW with no handlers. A test answers what it expects; the handlers go after each test:

```ts
import { http, HttpResponse } from "msw";
import { server } from "@jwcarman/roux-web/testing";

server.use(http.get("/api/labels", () => HttpResponse.json([{ id: "l1", name: "Errand" }])));
```

- A request no handler answers never reaches the real network, and fails the test that sent it
  ("No handler answered: GET /api/labels"), so a test cannot pass on a screen that silently failed to
  load. `checkAllAnswered()` is that check, which the setup runs after each test.
- `settle(timeout = 1000)` waits until every request in flight has its answer (the setup runs it
  after each test, so an answer never lands after the test environment is gone); a request held open
  on purpose (`delay("infinite")`) is given up on after the timeout.
- `listen()` starts the fake network; the setup calls it.

### Rendering

`renderWithProviders(ui, client?)` renders inside roux's providers: the query client and the theme.
`testQueryClient()` is roux's query client (so `meta.refreshes` works; never `new QueryClient()`)
without retries, so a failure shows at once. `renderHookWithProviders(hook, client?, initialProps?)`
does the same for a hook. Both return the `client` with Testing Library's result.

jsdom applies no stylesheet, so a responsive or state style (a column count from `md` up, a ring on
a pressed button) is checked from the rules themselves: `rulesFor(element)` is every CSS rule for the
element's classes, media queries included, as one string to match
(`expect(rulesFor(grid)).toMatch(/min-width: 48rem\)[^}]*repeat\(5/)`). `paletteOf(element)` names the
colour palette Chakra gives it (`"red"` for a destructive button), or `undefined`.

A component that asks for confirmation or shows a toast needs those mounted in the test, as the app's
shell mounts them:

```tsx
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { renderWithProviders } from "@jwcarman/roux-web/testing";

renderWithProviders(
  <ConfirmProvider>
    <LabelFormDialog open onClose={vi.fn()} />
    <Toaster />
  </ConfirmProvider>,
);
```

### Answering with problems

The server's refusals have fixed shapes (`contracts/problem-*.json` in roux's repository, described in
[Errors](errors.md#the-problem-shape)). The kit builds them exactly as the server sends them, with the
`application/problem+json` content type that `problemOf` requires:

| Answer | Status | As the server answers |
| --- | --- | --- |
| `invalidFields({ name: "Must not be blank" })` | 400 | `problem.Validation` or `problem.InvalidField` |
| `invariantViolation("A class meets at most 7 times a week")` | 400 | `problem.BadRequest` |
| `notFound("No label l9")` | 404 | `problem.NotFound` |
| `stale()` | 409 | a save at a version that is no longer the latest |
| `serverError(errorId?)` | 500 | an unexpected failure, with the reference it logged |

```ts
server.use(http.post("/api/labels", () => invalidFields({ name: "Another label has this name" })));
```

Write field messages in the server's words (`Must not be blank`, `Another label has this name`).

### A form test

```tsx
// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { toaster } from "@jwcarman/roux-web/feedback";
import { queryKeys } from "../queryKeys";
import { invalidFields, renderWithProviders, server, stale } from "@jwcarman/roux-web/testing";
import type { Label } from "./labels";
import { LabelFormDialog } from "./LabelFormDialog";

const URGENT: Label = { id: "l2", name: "Urgent", colour: "red", version: 3 };

async function open(label?: Label) {
  const { client } = renderWithProviders(<LabelFormDialog label={label} trigger={<Button>Open</Button>} />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog, invalidate };
}

describe("LabelFormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token"; // the client sends it as X-XSRF-TOKEN, with no bootstrap call
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("checks the fields in the server's words and sends nothing while they are wrong", async () => {
    const sent = vi.fn();
    server.use(http.post("/api/labels", sent));
    const { user } = await open();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(sent).not.toHaveBeenCalled();
  });

  it("adds a label, toasts, refreshes the list and closes", async () => {
    let body: unknown;
    server.use(
      http.post("/api/labels", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "l1", name: "Errand", colour: "gray", version: 0 }, { status: 201 });
      }),
    );
    const { user, dialog, invalidate } = await open();

    await user.type(screen.getByLabelText(/^Name/), " Errand ");
    await user.selectOptions(screen.getByLabelText(/^Colour/), "gray");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Errand was saved");
    expect(body).toEqual({ name: "Errand", colour: "gray" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.labels.lists() });
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("puts the server's field error under the field", async () => {
    server.use(http.put("/api/labels/l2", () => invalidFields({ name: "Another label has this name" })));
    const { user, dialog } = await open(URGENT);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Another label has this name")).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("says so when someone else saved the label first", async () => {
    server.use(http.put("/api/labels/l2", () => stale()));
    const { user } = await open(URGENT);

    await user.click(screen.getByRole("button", { name: "Save" }));

    // The toaster keeps an empty live region with role="alert" too: find the toast by its text.
    const title = await screen.findByText("Could not save");
    expect(title.closest("[role=alert]")).toHaveTextContent("This record changed since you loaded it");
  });
});
```

- Find fields by label (`getByLabelText(/^Name/)`; the required indicator follows the label) and
  buttons by role and name, as a user would.
- Set the `XSRF-TOKEN` cookie before a write, or the client first asks `/api/roux/auth/me` for one,
  and that request needs a handler too.
- Assert the request body the server would receive (trimmed, `""` as `null`, `version` on an update),
  the toast (`role="status"` for success; for a failure, find the title text, then its
  `[role=alert]`), and `invalidateQueries` called with the keys in `meta.refreshes`.
- Clear toasts after each test with `toaster.remove()` inside `act`, or one test's toast is still
  on screen in the next.

### A route test

A page that keeps its state in the URL (a `QueryTable` with `params`) is tested through the router.
`src/testing/route.tsx`, the one test helper that stays the app's own (it needs the app's route tree
and its `App`), opens a path in the whole app, signed in with roux-web's `signedInAs`:

```tsx
import {
  createBrowserHistory,
  createMemoryHistory,
} from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App, createAppRouter } from "../App";
import {
  server,
  signedInAs,
  testQueryClient,
} from "@jwcarman/roux-web/testing";

/**
 * Opens `path` in the whole app, as TanStack's file-based routing guide tests routes: a router
 * built from the generated route tree, in memory, signed in with `permissions` (or signed out with
 * `null`). Returns the router, so a test can check where it ended up. `browserHistory` uses the
 * window's own address bar instead of memory, for what only the browser's history does (a page that
 * rewrites the address itself, as the sign-in link's does).
 */
export function renderRoute(
  path: string,
  {
    permissions,
    browserHistory = false,
  }: { permissions: string[] | null; browserHistory?: boolean },
) {
  server.use(...signedInAs(permissions));
  const client = testQueryClient();
  if (browserHistory) {
    window.history.replaceState({}, "", path);
  }
  const router = createAppRouter(
    client,
    browserHistory
      ? createBrowserHistory()
      : createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App queryClient={client} router={router} />);
  return { router, client };
}
```

`signedInAs(permissions)` answers the session's two requests (`/api/roux/auth/me` and
`/api/roux/users/me`) for `TEST_USER` holding the permissions, or for nobody (`null`). The helper
renders the app's own `App`, so the providers and the router's context are the ones `main.tsx`
uses.

A paged endpoint answers with a `PageDto`: `pageOf(rows, params)` answers one page of `rows` as a roux list endpoint answers `params`
(page 0 of 20 unless they say otherwise, with the pagination block).

```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { pageOf, server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../testing/route";
import { ITEMS_READ } from "../permissions.gen";
import type { ItemRow } from "./items";

const ITEMS: ItemRow[] = [
  { id: "i1", title: "Order the venue", day: "2026-11-24", at: "10:30", done: false, assigneeNames: ["Ada"], version: 0 },
  { id: "i2", title: "Send the invitations", day: "2026-11-25", at: null, done: true, assigneeNames: [], version: 2 },
];

/** `/api/items`, filtering by status, and recording each request's query string. */
function itemsEndpoint() {
  const queries: string[] = [];
  server.use(
    http.get("/api/items", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const status = url.searchParams.get("status");
      const rows = status ? ITEMS.filter((item) => item.done === (status === "done")) : ITEMS;
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
  );
  return queries;
}

describe("/items", () => {
  it("lists the items, each linking to its page", async () => {
    itemsEndpoint();
    renderRoute("/items", { permissions: [ITEMS_READ] });

    const table = await screen.findByRole("table", { name: "Items" });
    expect(await within(table).findByRole("link", { name: "Order the venue" })).toHaveAttribute("href", "/items/i1");
    expect(within(table).getByRole("row", { name: /Send the invitations/ })).toHaveTextContent("Done");
  });

  it("filters by status from the chips, and keeps the filter in the URL", async () => {
    const queries = itemsEndpoint();
    const { router } = renderRoute("/items", { permissions: [ITEMS_READ] });
    const table = await screen.findByRole("table", { name: "Items" });
    await within(table).findByText("Order the venue");

    await userEvent.setup().click(screen.getByRole("button", { name: "Done", pressed: false }));

    expect(await within(table).findByText("Send the invitations")).toBeInTheDocument();
    expect(within(table).queryByText("Order the venue")).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ status: "done" });
    expect(queries.at(-1)).toContain("status=done");
  });
});
```

Assert what is on screen, where the router ended up (`router.state.location.search`), and the query
string the endpoint received.

## Playwright

The end-to-end suite (`e2e/`) drives the built app in Chromium against a real database and a real
mail catcher. It is given the app's and Mailpit's addresses in the environment (`E2E_BASE_URL`,
`E2E_MAILPIT_URL`) and needs the app started first: the binary from `make build` (or `go run
./cmd/server` with `FRONTEND_DIR=frontend/dist`), on a fresh database, with `SMTP_ADDR` at
Mailpit, `PASSKEY_RP_ID=localhost` and `PASSKEY_ORIGINS` and `PUBLIC_URL` at the app's address.
Then, in `e2e/`, `npx playwright test`.

The suite signs in as a user does: it asks for a link on the sign-in page, reads the link from
Mailpit's API, and opens it. Passkeys use Chrome's virtual authenticator (the DevTools `WebAuthn`
domain). Requests a test intercepts are sign-in's, under `/api/roux/auth`.

### The Content-Security-Policy test

roux's browser code runs under a strict policy (`script-src 'self' 'nonce-...'`, no `unsafe-eval`;
see [Getting started](getting-started.md#the-shell)). The suite proves it: it records
every violation from before the page's own code runs, uses the app, and expects none. The policy
header is roux's (it writes one with a fresh nonce on every response of the shell):

```ts
import { expect, test, type Page } from "@playwright/test";

declare global {
  interface Window {
    cspViolations: string[];
    injectedScriptRan?: boolean;
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

test("the sign-in page runs under its Content-Security-Policy without a violation", async ({ page }) => {
  await recordViolations(page);
  const response = await page.goto("/signin");
  expect(response?.headers()["content-security-policy"]).toMatch(/script-src 'self' 'nonce-[^']+'/);
  await expect(page.getByRole("heading", { name: "Sign in", level: 2 })).toBeVisible();

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
```

The template's version also signs in and opens a table, sorts it, opens a dialog, saves a form so a
toast shows, and switches the colour mode, because each adds styles of its own. Add each new kind of
screen to that walk.

## Don't

- Don't mock roux, the API module or the query client; answer requests with MSW, and run the Go
  tests against a real database.
- Don't build Problem Detail bodies inline in each test; use `problems.ts`, which matches roux's
  contracts.
- Don't create a `QueryClient` in a test; use `testQueryClient()` (roux's client).
- Don't fake the database in Go tests (an interface over the service, an in-memory store); roux
  apps run on PostgreSQL.
- Don't import roux-web's internal test helpers; the app has its own.
