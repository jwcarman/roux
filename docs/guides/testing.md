# Testing

A roux app is tested at three levels, each against the real thing as far as it can be:

- **Java:** the whole app, with who and PostgreSQL, through MockMvc (`@AppTest`). Controller tests
  sign in as a role and assert the Problem Details the browser will read.
- **Vitest with MSW:** components, forms and routes in jsdom, against a fake network that answers
  with the shapes roux's server sends, refusals included.
- **Playwright:** the built app in a browser, signing in by email link, including a
  Content-Security-Policy test.

The helpers come from roux: `roux-test` for Java and `@jwcarman/roux-web/testing` for the browser.
The app keeps one helper of its own, `renderRoute`, because it needs the app's route tree. Do not
import from roux's source.

## Dependencies

One test dependency in `pom.xml`, without a version (`roux-bom` manages it). It brings JUnit, AssertJ,
MockMvc, who-test (with `spring-security-test`), Testcontainers' PostgreSQL and the PostgreSQL driver:

```xml
<dependency>
    <groupId>org.jwcarman.roux</groupId>
    <artifactId>roux-test</artifactId>
    <scope>test</scope>
</dependency>
```

and in the frontend's `package.json`, as dev dependencies: `vitest`, `jsdom`, `msw`,
`@testing-library/react`, `@testing-library/user-event`, `@testing-library/jest-dom`; Playwright
(`@playwright/test`) lives in its own `e2e/` package.

## Java: the whole app on PostgreSQL

Tests run the real app: who's security chain, roux's problem answers, the app's Liquibase changelog
(after who's and roux's tables, which migratory creates), on PostgreSQL. Nothing is mocked; the app's
`application.yml` applies, so its required settings
([Getting started](getting-started.md#required-settings)) are already there. Everything below is in
`org.jwcarman.roux.test`.

### @AppTest

One annotation for every test that needs the app: `@SpringBootTest` on the app's own configuration,
MockMvc, a database of its own, `TestUsers` and `TestClock`, and `roux.owner.email` set to
`TestUsers.OWNER_EMAIL`.

```java
@AppTest
class StudentsControllerTest { ... }

@AppTest(webEnvironment = WebEnvironment.RANDOM_PORT) // a test that needs a real port
class SessionCookieTest { ... }
```

Test classes with the same configuration share one running app and one database, so each test starts
with `users.reset(...)`. A class that adds `@TestPropertySource` (or `@Import`) gets an app and a
database of its own.

### The database: TestDatabase

`@AppTest` gives each application context a new, empty database (`app_test_<12 hex>`) on one
PostgreSQL server per test run: a Testcontainers `postgres:16` started on first use (Docker must be
running), or, where there is no Docker, the server named by `ROUX_TEST_DATABASE_URL`,
`ROUX_TEST_DATABASE_USERNAME` and `ROUX_TEST_DATABASE_PASSWORD` (a user who may create databases).
A test that opens a database itself calls `TestDatabase.create()`; a `@DynamicPropertySource` points
the app at one with `TestDatabase.register(registry)`.

### Signed-in people: TestUsers

```java
@Autowired TestUsers users;

@BeforeEach
void clean_slate() {
  users.reset("promotion", "student"); // the app's tables to empty
}

TestUser ivy = users.signedIn("Ivy Instructor", "ivy@example.org", Roles.INSTRUCTOR);
ivy.perform(get("/api/students")).andExpect(status().isOk());
users.owner().perform(delete("/api/plans/" + id)).andExpect(status().isNoContent());
users.anonymous().perform(get("/api/students")).andExpect(status().isUnauthorized());
```

- `reset(String... appTables)` removes every user (who's tables, cascading to what refers to them),
  empties `appTables`, deletes the roles a test made (any role that did not exist when the app
  started), puts `TestClock` back on real time and makes the owner again, as roux does at startup. An
  app table that refers to who's tables empties with them; list the others.
- `signedIn(name, email, role)` makes a user as a real one is made: who's identity, the address and
  the role, and `UserJoined` (with that role) published, in one transaction ([Roles](roles.md)). The
  app's listener for `UserJoined` makes its own data for them, so a test person has what an invited
  one has. The role is one of the app's, by name; an unknown one fails naming the roles there are. A
  `Role` a test made itself is accepted too: `signedIn(name, email, role)` with who's `Role`.
- An address already registered, or a `UserJoined` listener that throws, fails `signedIn` and leaves
  no one behind.
- `owner()` is the owner the app made from `TestUsers.OWNER_EMAIL`, signed in; `anonymous()` a
  browser with no one signed in.
- `TestUser` is `(id, browser)`: `perform(request)` sends a request as them. The browser is
  who-test's `WhoMockMvcBrowser`: it keeps the session and cookies between requests, and on `POST`,
  `PUT`, `PATCH` and `DELETE` sends `X-XSRF-TOKEN` from the `XSRF-TOKEN` cookie, as roux's browser
  client does; `browser().performWithoutCsrf(request)` proves a write without it is refused (`403`).

### Time: TestClock

`TestClock` is the app's `Clock` in an `@AppTest`: UTC, on real time until a test sets it.

```java
@Autowired TestClock clock;

clock.set("2026-11-10T17:32:00Z"); // stopped there
clock.advance(Duration.ofDays(1));  // moved on a day
clock.useRealTime();               // reset does this too
```

The app reads time only from the injected `Clock` ([Dates and time](dates-and-time.md)), so a test
that sets it controls "now" everywhere, who's sessions excepted.

### Mail: RecordingWhoEmailSender and TestMail

Tests sign in through `TestUsers`, so no mail is needed for that. A test of the app's own invitation
or sign-in emails captures them:

- `RecordingWhoEmailSender`, declared as a bean in the test (`@Import` a `@TestConfiguration` that
  returns `new RecordingWhoEmailSender()`), replaces who's mail sender and keeps each sign-in or
  invitation link sent: `sent()` is a list of `Sent(address, link, code)`; `failSends()` makes sends
  fail (to test what the app does when mail is down); `clear()` forgets them.
- `TestMail` is a real mail server for an end-to-end test: `TestMail.get()` is a Mailpit
  (`Mail(smtpHost, smtpPort, apiUrl)`) started on first use, or the one named by
  `ROUX_TEST_MAIL_SMTP_HOST`, `ROUX_TEST_MAIL_SMTP_PORT` and `ROUX_TEST_MAIL_API_URL`. Point
  `spring.mail.*` at it and read the mail from its API.

### A controller test

```java
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayNameGeneration;
import org.junit.jupiter.api.DisplayNameGenerator;
import org.junit.jupiter.api.Test;
import org.jwcarman.roux.test.AppTest;
import org.jwcarman.roux.test.TestUser;
import org.jwcarman.roux.test.TestUsers;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.jayway.jsonpath.JsonPath;

@AppTest
@DisplayNameGeneration(DisplayNameGenerator.ReplaceUnderscores.class)
class StudentsControllerTest {

  private static final String STUDENTS = "/api/students";

  @Autowired TestUsers users;

  private TestUser instructor;

  @BeforeEach
  void clean_slate() {
    users.reset("promotion", "student");
    instructor = users.signedIn("Ivy Instructor", "ivy@example.org", Roles.INSTRUCTOR);
  }

  @Test
  void a_signed_out_caller_is_refused_with_401() throws Exception {
    users.anonymous().perform(get(STUDENTS)).andExpect(status().isUnauthorized());
  }

  @Test
  void a_blank_name_is_a_400_on_the_name_field() throws Exception {
    instructor
        .perform(json(post(STUDENTS), "{\"name\":\" \",\"joinedOn\":\"2026-11-01\"}"))
        .andExpect(status().isBadRequest())
        .andExpect(content().contentTypeCompatibleWith(MediaType.APPLICATION_PROBLEM_JSON))
        .andExpect(jsonPath("$.detail").value("The request has invalid fields"))
        .andExpect(jsonPath("$.errors[?(@.field == 'name')].message").value("Must not be blank"));
  }

  @Test
  void a_missing_student_is_a_404_naming_it() throws Exception {
    UUID missing = UUID.randomUUID();

    instructor
        .perform(get(STUDENTS + "/" + missing))
        .andExpect(status().isNotFound())
        .andExpect(jsonPath("$.detail").value("No student " + missing));
  }

  @Test
  void an_unknown_sort_is_a_400_on_sortBy() throws Exception {
    instructor
        .perform(get(STUDENTS).param("sortBy", "AGE"))
        .andExpect(status().isBadRequest())
        .andExpect(jsonPath("$.errors[0].field").value("sortBy"));
  }

  @Test
  void a_stale_version_is_a_409() throws Exception {
    String id = create("Ada Lovelace");

    instructor
        .perform(
            json(
                put(STUDENTS + "/" + id),
                "{\"name\":\"Ada King\",\"joinedOn\":\"2026-11-01\",\"version\":7}"))
        .andExpect(status().isConflict())
        .andExpect(jsonPath("$.detail").value("This record changed since you loaded it"));
  }

  private String create(String name) throws Exception {
    String response =
        instructor
            .perform(json(post(STUDENTS), "{\"name\":\"%s\",\"joinedOn\":\"2026-11-01\"}".formatted(name)))
            .andExpect(status().isCreated())
            .andReturn()
            .getResponse()
            .getContentAsString();
    return JsonPath.read(response, "$.id");
  }

  private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder request, String body) {
    return request.contentType(MediaType.APPLICATION_JSON).content(body);
  }
}
```

What a controller test asserts:

- **The status and the user's words.** `$.detail` and `$.errors[?(@.field == 'name')].message` are
  what the browser shows, word for word, so assert them exactly ([Errors](errors.md)). The content
  type is `application/problem+json`.
- **One test per refusal the endpoint can give:** signed out (`401`), a missing permission (`403`,
  sign in with a role that lacks it), an invalid field (`400` with `errors`), a missing record
  (`404`), a stale `version` (`409`), an unknown `sortBy` on a list (`400` on `sortBy`).
- **The happy path through the API**, as the browser calls it: create, read back, update at the
  version read, list with search, filters and sort.

Sign in through `TestUsers`, not with Spring Security Test's `user(...)`: that principal is not a
who identity, so it has none of the app's roles or permissions, and code that reads the caller's
identity finds none. Do not send `csrf().asHeader()` either: its token is masked, and who's CSRF
setup (`csrf.spa()`) refuses it; `WhoMockMvcBrowser` sends the cookie's value, as the browser does.

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
context before each test (one fixed school and day, [Dates and time](dates-and-time.md#test)), and
after each test waits for the requests still in flight, unmounts, drops the test's handlers and fails
the test if a request went unanswered. It also gives jsdom what Chakra reaches for (`matchMedia`,
`ResizeObserver`, `scrollTo`).

### The fake network

`server` is MSW with no handlers. A test answers what it expects; the handlers go after each test:

```ts
import { http, HttpResponse } from "msw";
import { server } from "@jwcarman/roux-web/testing";

server.use(http.get("/api/ranks", () => HttpResponse.json([{ id: "r1", name: "White" }])));
```

- A request no handler answers never reaches the real network, and fails the test that sent it
  ("No handler answered: GET /api/ranks"), so a test cannot pass on a screen that silently failed to
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

A component that asks for confirmation or shows a toast needs those mounted in the test, as the app's
shell mounts them:

```tsx
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { renderWithProviders } from "@jwcarman/roux-web/testing";

renderWithProviders(
  <ConfirmProvider>
    <RankFormDialog open onClose={vi.fn()} />
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
| `invalidFields({ name: "Must not be blank" })` | 400 | a Bean Validation failure or an `InvalidFieldException` |
| `invariantViolation("A class meets at most 7 times a week")` | 400 | an `InvariantViolationException` |
| `notFound("No rank r9")` | 404 | a `NotFoundException` |
| `stale()` | 409 | a save at a version that is no longer the latest |
| `serverError(errorId?)` | 500 | an unexpected failure, with the reference it logged |

```ts
server.use(http.post("/api/ranks", () => invalidFields({ name: "Another rank has this name" })));
```

Write field messages in the server's words (`Must not be blank`, `Another rank has this name`).

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
import type { Rank } from "./ranks";
import { RankFormDialog } from "./RankFormDialog";

const YELLOW: Rank = { id: "r2", name: "Yellow belt", colour: "YELLOW", version: 3 };

async function open(rank?: Rank) {
  const { client } = renderWithProviders(<RankFormDialog rank={rank} trigger={<Button>Open</Button>} />);
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog");
  return { user, dialog, invalidate };
}

describe("RankFormDialog", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token"; // the client sends it as X-XSRF-TOKEN, with no bootstrap call
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("checks the fields in the server's words and sends nothing while they are wrong", async () => {
    const sent = vi.fn();
    server.use(http.post("/api/ranks", sent));
    const { user } = await open();

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(sent).not.toHaveBeenCalled();
  });

  it("adds a rank, toasts, refreshes the list and closes", async () => {
    let body: unknown;
    server.use(
      http.post("/api/ranks", async ({ request }) => {
        body = await request.json();
        return HttpResponse.json({ id: "r1", name: "White belt", colour: "WHITE", version: 0 }, { status: 201 });
      }),
    );
    const { user, dialog, invalidate } = await open();

    await user.type(screen.getByLabelText(/^Name/), " White belt ");
    await user.selectOptions(screen.getByLabelText(/^Colour/), "WHITE");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("White belt was saved");
    expect(body).toEqual({ name: "White belt", colour: "WHITE" });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.ranks.lists() });
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("puts the server's field error under the field", async () => {
    server.use(http.put("/api/ranks/r2", () => invalidFields({ name: "Another rank has this name" })));
    const { user, dialog } = await open(YELLOW);

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Another rank has this name")).toBeInTheDocument();
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("says so when someone else saved the rank first", async () => {
    server.use(http.put("/api/ranks/r2", () => stale()));
    const { user } = await open(YELLOW);

    await user.click(screen.getByRole("button", { name: "Save" }));

    // The toaster keeps an empty live region with role="alert" too: find the toast by its text.
    const title = await screen.findByText("Could not save");
    expect(title.closest("[role=alert]")).toHaveTextContent("This record changed since you loaded it");
  });
});
```

- Find fields by label (`getByLabelText(/^Name/)`; the required indicator follows the label) and
  buttons by role and name, as a user would.
- Set the `XSRF-TOKEN` cookie before a write, or the client first asks `/who/me` for one, and that
  request needs a handler too.
- Assert the request body the server would receive (trimmed, `""` as `null`, `version` on an update),
  the toast (`role="status"` for success; for a failure, find the title text, then its
  `[role=alert]`), and `invalidateQueries` called with the keys in `meta.refreshes`.
- Clear toasts after each test with `toaster.remove()` inside `act`, or one test's toast is still
  on screen in the next.

### A route test

A page that keeps its state in the URL (a `QueryTable` with `params`) is tested through the router.
`src/testing/route.tsx`, the one test helper that stays the app's own (it needs the app's route tree
and session), opens a path in the whole app, signed in through a mocked `/who/me`:

```tsx
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { http, HttpResponse } from "msw";
import { routeTree } from "../routeTree.gen";
import { SessionProvider } from "../session";
import { renderWithProviders, server, testQueryClient } from "@jwcarman/roux-web/testing";

/**
 * Opens `path` in the whole app: the generated route tree in a memory router, signed in with
 * `permissions` (or signed out with `null`). Returns the router, to check where it ended up.
 */
export function renderRoute(path: string, { permissions }: { permissions: string[] | null }) {
  server.use(
    http.get("/who/me", () =>
      permissions === null
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({ identityId: "id-1", permissions }),
    ),
  );
  const client = testQueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: client },
  });
  renderWithProviders(
    <SessionProvider>
      <RouterProvider router={router} />
    </SessionProvider>,
    client,
  );
  return { router, client };
}
```

Its context and providers must match the app's own `main.tsx` (here a `queryClient` in the router
context, and the getting-started guide's `SessionProvider`). A paged endpoint answers with a
`PageDto`: `pageOf(rows, params)` answers one page of `rows` as a roux list endpoint answers `params`
(page 0 of 20 unless they say otherwise, with the pagination block).

```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { pageOf, server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../testing/route";
import type { Student } from "./students";

const STUDENTS: Student[] = [
  { id: "s1", name: "Ada Lovelace", email: "ada@example.org", joinedOn: "2026-09-01", status: "ACTIVE" },
  { id: "s2", name: "Grace Hopper", email: null, joinedOn: "2026-10-01", status: "INACTIVE" },
];

/** `/api/students`, filtering by status, and recording each request's query string. */
function studentsEndpoint() {
  const queries: string[] = [];
  server.use(
    http.get("/api/students", ({ request }) => {
      const url = new URL(request.url);
      queries.push(url.search);
      const status = url.searchParams.get("status");
      const rows = status ? STUDENTS.filter((student) => student.status === status) : STUDENTS;
      return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 25 }));
    }),
  );
  return queries;
}

describe("/students", () => {
  it("lists the students, with a dash for no email", async () => {
    studentsEndpoint();
    renderRoute("/students", { permissions: [] });

    const table = await screen.findByRole("table", { name: "Students" });
    expect(await within(table).findByRole("link", { name: "Ada Lovelace" })).toHaveAttribute("href", "/students/s1");
    expect(within(table).getByRole("row", { name: /Grace Hopper/ })).toHaveTextContent("—");
  });

  it("filters by status from the chips, and keeps the filter in the URL", async () => {
    const queries = studentsEndpoint();
    const { router } = renderRoute("/students", { permissions: [] });
    const table = await screen.findByRole("table", { name: "Students" });
    await within(table).findByText("Ada Lovelace");

    await userEvent.setup().click(screen.getByRole("button", { name: "Inactive", pressed: false }));

    expect(await within(table).findByText("Grace Hopper")).toBeInTheDocument();
    expect(within(table).queryByText("Ada Lovelace")).not.toBeInTheDocument();
    expect(router.state.location.search).toEqual({ status: "INACTIVE" });
    expect(queries.at(-1)).toContain("status=INACTIVE");
  });
});
```

Assert what is on screen, where the router ended up (`router.state.location.search`), and the query
string the endpoint received.

## Playwright

The end-to-end suite (`e2e/`) drives the built app in Chromium against a real database and a real
mail catcher. In the template a Maven integration test (`E2eIT`, run by Failsafe in `verify`)
starts PostgreSQL (`TestDatabase`), Mailpit and the app on a free port, passes their URLs to the
suite in the environment (`E2E_BASE_URL`, `E2E_MAILPIT_URL`), and runs `npx playwright test`. The
app's arguments set the URL-dependent settings: `who.passkey.rp-id=localhost`,
`who.passkey.allowed-origins` and the link base URL at the chosen port, and `spring.mail.host` and
`spring.mail.port` at Mailpit (`who.email.from` set, and `who-email-smtp` on the classpath).

The suite signs in as a user does: it asks for a link on the sign-in page, reads the link from
Mailpit's API, and opens it. Passkeys use Chrome's virtual authenticator (the DevTools `WebAuthn`
domain). Requests a test intercepts are who's, under `/who` (`/who/me/passkeys/options`).

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

- Don't mock roux, who, the API module or the query client; answer requests with MSW, and run the
  Java tests against the real app.
- Don't build Problem Detail bodies inline in each test; use `problems.ts`, which matches roux's
  contracts.
- Don't create a `QueryClient` in a test; use `testQueryClient()` (roux's client).
- Don't use H2 or an in-memory database for the Java tests; roux apps run on PostgreSQL.
- Don't import roux-web's internal test helpers; the app has its own.
