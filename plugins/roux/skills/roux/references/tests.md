# Tests beyond the recipe

The controller test and the form test are `feature.md` steps 11–12. This card covers the kit:
time, mail, the database, route tests, paged answers and Playwright.

## Rules

- Nothing is mocked: Java tests run the whole app on PostgreSQL; Vitest answers requests with MSW.
  Never mock roux, who, the API module or the query client; never H2.
- Sign in only through `TestUsers`; no Spring Security Test `user(...)`, no `csrf().asHeader()`.
- Never `new QueryClient()` in a test: `testQueryClient()` or `renderWithProviders`.
- Build problems with the kit (`invalidFields`, `invariantViolation`, `notFound`, `stale`,
  `serverError`), in the server's words.
- A test that fails is a finding to fix, not to delete.

## Names: Java (`org.jwcarman.roux.test`, dependency `roux-test`, test scope, no version)

- `@AppTest` (`webEnvironment = RANDOM_PORT` for a real port): the app, MockMvc, its own database,
  `TestUsers`, `TestClock`, `roux.owner.email` = `TestUsers.OWNER_EMAIL`. Classes with the same
  config share an app, so every test starts with `users.reset()`.
- `TestUsers`: `reset()` (users gone, the app's tables emptied without naming them, owner made
  again, clock back to real time), `signedIn(name, email, role)` → `TestUser` (publishes
  `UserJoined`), `owner()`, `anonymous()`. `TestUser.perform(request)`; `browser().performWithoutCsrf(...)`
  proves a write without the token is a 403.
- `TestClock`: `set("2026-11-10T17:32:00Z")`, `advance(Duration.ofDays(1))`, `useRealTime()`.
- `TestDatabase`: a fresh `app_test_<hex>` database per context on Testcontainers `postgres:16`, or
  `ROUX_TEST_DATABASE_URL`/`_USERNAME`/`_PASSWORD` without Docker; `TestDatabase.create()`,
  `TestDatabase.register(registry)`.
- `RecordingWhoEmailSender` (a `@TestConfiguration` bean): `sent()` → `Sent(address, link, code)`,
  `failSends()`, `clear()`. `TestMail.get()`: a Mailpit for end-to-end mail.

## Names: Vitest (`@jwcarman/roux-web/testing`)

- Setup: `src/testing/setup.ts` is `import "@jwcarman/roux-web/testing/setup";` (jest-dom, the fake
  network, a fixed organization and day, the after-each checks).
- `server` (MSW, strict: an unanswered request fails the test), `listen()`, `settle(timeout)`,
  `checkAllAnswered()` (the setup runs these).
- `renderWithProviders(ui, client?)`, `renderHookWithProviders(hook, client?, props?)`,
  `testQueryClient()`.
- Problems: `invalidFields({ name: "..." })` 400, `invariantViolation("...")` 400, `notFound("...")`
  404, `stale()` 409, `serverError(errorId?)` 500.
- `pageOf(rows, params)`: a `PageDto` as a list endpoint answers.
- Styles: `rulesFor(element)` (the CSS rules as a string), `paletteOf(element)` (`"red"`...).
- Dates: `setOrganization(testOrganization({ today: "2026-11-17" }))` (`dates.md`).

## Example: a route test

`src/testing/route.tsx`'s `renderRoute(path, { permissions })` (the app's own helper) opens a path
in the whole app, signed in through a mocked `/who/me`. The test file sits beside the route with a
leading `-` so the router ignores it:

```tsx
// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { expect, it } from "vitest";
import { pageOf, server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../../testing/route";
import type { Student } from "../../students/students";

const STUDENTS: Student[] = [
  { id: "s1", name: "Ada Lovelace", email: null, joinedOn: "2026-09-01", status: "ACTIVE" },
  { id: "s2", name: "Grace Hopper", email: null, joinedOn: "2026-10-01", status: "INACTIVE" },
];

it("filters by status and keeps it in the URL", async () => {
  server.use(http.get("/api/students", () => HttpResponse.json(pageOf(STUDENTS, { pageIndex: 0, pageSize: 25 }))));
  const { router } = renderRoute("/students", { permissions: ["students.read"] });
  const table = await screen.findByRole("table", { name: "Students" });
  await within(table).findByText("Ada Lovelace");

  await userEvent.setup().click(screen.getByRole("button", { name: "Inactive", pressed: false }));

  expect(router.state.location.search).toEqual({ status: "INACTIVE" });
});
```

## Playwright

`e2e/` runs inside `./mvnw verify` (`E2eIT`, Failsafe: PostgreSQL, Mailpit and the app on a free
port; `E2E_BASE_URL`, `E2E_MAILPIT_URL`); `-DskipITs` skips it. It signs in by email link read from
Mailpit. The Content-Security-Policy test records `securitypolicyviolation` events from an init
script and expects none while it walks the app; add each new kind of screen to that walk.

## Check

- Java: `./mvnw verify` (Docker). Without Docker, the skill's `scripts/check.sh` only compiles
  them: read each against `feature.md` step 11.
- Frontend: `cd frontend && npm test`; coverage must be 100%.

## Pitfalls

- A page that starts calling a new endpoint breaks every test rendering it until they answer it.
- Forgetting `document.cookie = "XSRF-TOKEN=token"` before a write: the client asks `/who/me` first,
  and that request needs a handler too.
- Toasts left from one test show in the next: `act(() => toaster.remove())` after each.
- Columns built per render: a test passes alone and fails after another.
- A component test without `// @vitest-environment jsdom` runs in Node and fails on the DOM.
