# Notes for coding agents

The dojo: a roux app (Spring Boot 4, roux's starter with who for identity, PostgreSQL through
Liquibase, and a React SPA in `frontend/` on `@jwcarman/roux-web`, Chakra UI v3, TanStack Router,
Query, Form and Table). It builds in roux's reactor against the roux code beside it. The README's "Adding a
feature" section is the full worked example (member profiles); read the part you need.

## Where things go

- One backend package per feature, `org.jwcarman.roux.examples.dojo.<feature>`, shaped like
  `members`: a controller under `/api/...`, a service, entities and repositories, request and
  response records.
- One frontend folder per feature, `frontend/src/<feature>/`, mirroring the package: its pages and
  dialogs, a `<feature>.ts` with its calls, schemas and query options, and its tests beside them.
  The app's frame (layout, nav, session, guards, colour mode, the sign-in and Appearance pages, Settings) is
  `frontend/src/shell/`.
- Schema changes: one changelog per feature in `src/main/resources/db/changelog`, included from
  `db.changelog-master.xml`.
- A screen: a thin route file in `frontend/src/routes` (file-based) that opens its feature's page,
  the page in `frontend/src/<feature>/`, shared types in `api.ts`, query keys in
  `queryKeys.ts`, a sidebar entry in `frontend/src/shell/nav.ts` (`defineNav`: a Lucide icon component,
  a one-sentence `description` an owner would understand). When a request decides which page the app
  opens on, move `start: true` to it and remove Home (`/`) from `nav.ts`; exactly one place has it
  (`defineNav` throws otherwise). A place's `permission` in `nav.ts` is the same one its route's
  `requirePermission` checks, imported from `frontend/src/permissions.gen.ts`. A new
  URL needs nothing on the server: roux serves the shell for any page URL.

## Rules that are easy to miss

- Gate endpoints on a permission, never a role: `@RequiresPermission(Permissions.MEMBERS_READ)`.
  A new permission is a constant in `identity/Permissions` and a new changeset in
  `db/changelog/roles.xml` granting it to `OWNER` and any other role that holds it (never edit one
  that has run). `PermissionsTest` checks the grants; `PermissionsListTest` rewrites
  `frontend/src/permissions.gen.ts` when it is stale and fails (no Docker needed): run
  `./mvnw test -Dskip.npm -Dtest=PermissionsListTest` until it passes and commit the file; never edit it by hand. A new class of permissions goes in
  `PermissionClasses.ALL`. See roux's
  `docs/guides/roles.md`.
- Errors are Problem Details. Throw `NotFoundException`, `InvariantViolationException` or
  `InvalidFieldException`; add no exception handlers. On the client `useSchemaForm` puts field
  errors under their fields, and `problemOf` and `notify.problem` read the rest.
- Time comes from the injected `Clock` (UTC). Never call `now()` without it.
- A record the client edits carries its `version`; a stale one is a 409.
- Changes worth a history go through `ActivityLog.record` in the same transaction.
- A mutation names what it changes in `meta: { refreshes: [queryKeys...] }`; never `invalidateQueries`
  by hand.
- Icons come only from `react-icons/lu`.

## Tests

- Spring tests use `@AppTest`, `TestUsers` (`users.reset()` in `@BeforeEach`, naming no tables,
  `users.signedIn(...)` for a browser) and `TestClock`.
- Client tests use Vitest, Testing Library and MSW, beside the code they test. **The fake server
  is strict: a request no handler answers fails the test.** When a page starts calling a new
  endpoint, every test that renders that page breaks until it answers the call. Find them with
  `grep -rlE "<Page>|<route path>|/api/<path>" frontend/src --include=*.test.tsx` and change them
  too. A test beside a route file starts with `-` so the router ignores it, and opens its URL with
  `renderRoute` (`frontend/src/testing/route.tsx`), as TanStack's guide to testing file-based routes does.
- Playwright scenarios in `e2e/tests` run inside `./mvnw verify` (`E2eIT`); `-DskipITs` skips
  them.


## Generated files

- Never hand-edit `frontend/src/routeTree.gen.ts`; TanStack's router plugin writes it.
