# Tests beyond the recipe

The feature's Go test and its form and route tests are `feature.md` steps 7 and 13. This card covers
the kits: the database, people and browsers, time, route tests, paged answers and Playwright.

## Rules

- Nothing is mocked: Go tests run the feature's real handlers on PostgreSQL over HTTP; Vitest
  answers requests with MSW. Never mock roux, the service, the API module or the query client.
- Sign in only through `a.SignedIn(id)`: it signs in as the browser does and carries the CSRF token.
- Never `new QueryClient()` in a test: `testQueryClient()` or `renderWithProviders`, or
  `meta.refreshes` never runs and forms never close.
- Build browser-side problems with the kit (`invalidFields`, `invariantViolation`, `notFound`,
  `stale`, `serverError`), in the server's words.
- A test that fails is a finding to fix, not to delete.

## Names: Go (`github.com/jwcarman/roux/rouxtest`, `.../authn/authntest`)

- `rouxtest.New(t, schema, migrations...)` → `*rouxtest.App`: a fresh schema with roux's tables;
  the database is `TEST_DATABASE_URL`, or a PostgreSQL container per package (Docker). Then
  `a.Role(name, permissions...)` (the app's roles; `OWNER` exists and holds everything),
  `a.Migrate(feature.Module{}.Migrations()...)`, register the routes on `a.Kit()`, `a.Serve()`.
- `a.Person(name, role)` → the member's id; `a.Deactivate(id)`; `a.SignedIn(id)` →
  `*authntest.Browser`; `a.Browser()` signed out.
- `a.Clock` starts at 2026-11-24 12:00 UTC: pass `a.Clock.Now` as the module's clock;
  `a.At(moment)` moves it; `a.Clock.Advance(d)`.
- `a.Pool` is the schema's pool, for setup and for reading what a request stored. `rouxtest.App`
  embeds `authntest.Env` (its `Pool`, `Clock`, `Server`, `SignedIn`, `Browser`).
- `Browser`: `Get(path)`, `Post(path, body)`, `Put(path, body)`, `Delete(path)`,
  `Do(method, path, body, csrf)` (`csrf` false proves a write without the token is a `403`).
  Each returns a `Reply`: `Want(t, status, what)` (fails with the body), `JSON(t)` (a map),
  `Decode(t, &v)`.
- The app's own: `cmd/server/permissions_test.go` (`rouxtest.PermissionsFile`,
  `rouxtest.CheckGrants`, `permissions.md`).

## Example: time

```go
func TestALateCheckInIsRefused(t *testing.T) {
	a := rouxtest.New(t, "classes")
	a.Migrate(classes.Module{}.Migrations()...)
	classes.Register(a.Kit(), classes.Service{Pool: a.Pool, Clock: a.Clock.Now})
	a.Serve()
	coach := a.SignedIn(a.Person("Coach Carter", "OWNER"))

	id := coach.Post("/api/classes", map[string]any{"startsAt": "2026-11-24T18:00:00Z"}).Want(t, 201, "add").JSON(t)["id"]
	a.At(time.Date(2026, 11, 24, 19, 0, 0, 0, time.UTC))
	coach.Post("/api/classes/"+id.(string)+"/check-ins", map[string]any{}).Want(t, 400, "after the class")
}
```

## Names: Vitest (`@jwcarman/roux-web/testing`)

- Setup: `src/testing/setup.ts` is `import "@jwcarman/roux-web/testing/setup";` (jest-dom, the fake
  network, a fixed organization and day, the after-each checks).
- `server` (MSW, strict: an unanswered request fails the test), `listen()`, `settle(timeout)`,
  `checkAllAnswered()` (the setup runs these).
- `renderWithProviders(ui, client?)`, `renderHookWithProviders(hook, client?, props?)`,
  `testQueryClient()`.
- Problems: `invalidFields({ name: "..." })` 400, `invariantViolation("...")` 400, `notFound("...")`
  404, `stale()` 409, `serverError(errorId?)` 500.
- `pageOf(rows, params)`: a page as a list endpoint answers.
- `TEST_USER`: who `signedInAs` signs in as (`id`, `displayName`, `email`).
- `signedInAs(permissions)`: the handlers for `/api/roux/auth/me` and `/api/roux/users/me`, signed in (`null`: signed out)
  with those permissions.
- Styles: `rulesFor(element)`, `paletteOf(element)`. Dates:
  `setOrganization(testOrganization({ today: "2026-11-17" }))` (`dates.md`).

## Example: a route test

`src/testing/route.tsx`'s `renderRoute(path, { permissions })` (the app's own helper) opens a path in
the whole app, signed in through `signedInAs`. The test file sits beside the route with a leading
`-` so the router ignores it:

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

`e2e/` holds the template's Playwright suite (`E2E_BASE_URL`, `E2E_MAILPIT_URL`); it signs in by the
email link read from Mailpit. It runs against an app you start yourself; the skill's check script
does not run it.

## Check

- Go: `go test ./...` with `TEST_DATABASE_URL` or Docker. Without either the check script skips
  them and says so: read each test against `feature.md` step 7.
- Frontend: `cd frontend && npm run coverage`; coverage must be 100%.

## Pitfalls

- `a.Migrate(...)` before `a.Role("USER")`: the feature's grants to `USER` find no role, and the
  `USER` browser gets `403` where it should get `200`.
- A module built with `time.Now` instead of `a.Clock.Now`: `a.At` changes nothing.
- A page that starts calling a new endpoint breaks every test rendering it until they answer it.
- Forgetting `document.cookie = "XSRF-TOKEN=token"` before a write in Vitest: the client asks
  `/api/roux/auth/me` first, and that request needs a handler too.
- Toasts left from one test show in the next: `act(() => toaster.remove())` after each.
- A component test without `// @vitest-environment jsdom` runs in Node and fails on the DOM.
