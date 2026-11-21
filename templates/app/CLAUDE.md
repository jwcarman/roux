# Notes for coding agents

A roux app: Spring Boot 4, roux's starter with who for identity, PostgreSQL through Liquibase, and a
React SPA in `frontend/` on `@jwcarman/roux-web` (Chakra UI v3, TanStack Router, Query, Form and
Table). **Use the `roux` skill (roux's Claude Code plugin) and read its guide for the task before
writing code**: roux's names are its own, and guesses from general Spring or React are wrong in the
details.

## Where things go

- One backend package per feature, `app.<feature>`: a controller under `/api/...`, a service,
  entities and repositories, request and response records. `app.identity` holds the roles and
  permissions.
- One frontend folder per feature, `frontend/src/<feature>/`, mirroring the package: its pages and
  dialogs, a `<feature>.ts` with its calls, schemas and query options, and its tests beside them.
  `frontend/src/users/` is the shape to follow. The app's frame (layout, nav, session, guards, colour
  mode, sign-in, Appearance, Settings) is `frontend/src/shell/`.
- Schema changes: one changelog per feature in `src/main/resources/db/changelog`, included from
  `db.changelog-master.xml`. roux's modules ship their own tables.
- A screen: a thin route file in `frontend/src/routes` (file-based) that opens its feature's page,
  shared types in `api.ts`, query keys in `queryKeys.ts`, and a sidebar entry in
  `frontend/src/shell/nav.ts` (`defineNav`: a Lucide icon component, a one-sentence `description` an
  owner would understand). When a request decides which page the app opens on, move `start: true` to
  it and remove Home (`/`) from `nav.ts`; exactly one place has it. A place's `permission` in
  `nav.ts` is the one its route's `requirePermission` checks, imported from
  `frontend/src/permissions.gen.ts`. A new URL needs nothing on the server: roux serves the shell for
  any page URL.
- A route file names its path as a type argument, `createFileRoute<"/_signedIn/widgets/">()({...})`:
  the router plugin supplies the path itself, so a string there is code no test can check. A page
  under `_signedIn` reads the caller with `useMe()` (from `routes/_signedIn.tsx`); a route's guard
  is `beforeLoad: ({ context }) => requirePermission(context.me, WIDGETS_READ)`.

## Rules that are easy to miss

- Gate endpoints on a permission, never a role: `@RequiresPermission(Permissions.WIDGETS_READ)`.
  A permission is a `public static final String` in `app.identity.Permissions` and a new changeset in
  `db/changelog/roles.xml` granting it to `OWNER` and any other role that holds it (never edit a
  changeset that has run). **The first permission creates `Permissions`; add `Permissions.class` to
  `PermissionsTest`'s `ALL` then.** `PermissionsTest` checks the grants and rewrites
  `frontend/src/permissions.gen.ts` when it is stale: run it and commit the file; never edit it by hand.
- A new role is a constant in `app.identity.Roles`, a changeset in `roles.xml`, an entry in
  `roux.roles.invitable` (application.yml) if invitations may give it, and its label in
  `frontend/src/users/users.ts` (`ROLE_LABELS`) and `api.ts`'s `User.role`.
- Errors are Problem Details. Throw `NotFoundException`, `InvariantViolationException` or
  `InvalidFieldException`; add no exception handlers. On the client `useSchemaForm` puts field errors
  under their fields, and `problemOf` and `notify.problem` read the rest.
- Time comes from the injected `Clock` (UTC). Never call `now()` without it.
- A record the client edits carries its `version`; a stale one is a 409.
- Changes worth a history go through `ActivityLog.record` in the same transaction.
- A mutation names what it changes in `meta: { refreshes: [queryKeys...] }`; never
  `invalidateQueries` by hand.
- Icons come only from `react-icons/lu`.
- Never suppress a warning; no star imports.

## Tests

- Spring tests use `@AppTest`, `TestUsers` (`users.reset(...)` in `@BeforeEach`,
  `users.signedIn(...)` for a browser) and `TestClock`.
- Client tests use Vitest, Testing Library and MSW, beside the code they test; a component test
  starts with `// @vitest-environment jsdom`. **The fake server is strict: a request no handler
  answers fails the test.** When a page starts calling a new endpoint, every test that renders that
  page breaks until it answers the call. Find them with
  `grep -rlE "<Page>|<route path>|/api/<path>" frontend/src --include=*.test.tsx` and change them too.
  A test beside a route file starts with `-` so the router ignores it, and opens its URL with
  `renderRoute` (`frontend/src/testing/route.tsx`).
- Playwright scenarios in `e2e/tests` run inside `./mvnw verify` (`E2eIT`); `-DskipITs` skips them.

## Generated files

- Never hand-edit `frontend/src/routeTree.gen.ts` (TanStack's router plugin writes it) or
  `frontend/src/permissions.gen.ts` (`PermissionsTest` writes it).
