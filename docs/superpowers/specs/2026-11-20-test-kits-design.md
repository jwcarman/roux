# Test kits in roux, and one way a member joins

## Intent

Every roux app needs the same test plumbing: the whole app on a real PostgreSQL, people signed in
with a role, captured mail, a clock a test can set, and in the browser a strict fake network and a
render with roux's providers. Today the testing guide says "the helpers below are the app's own
files (the template has them, and a new app copies them)": about 490 lines of Java and 270 of
TypeScript per app, copied and then drifting. roux should ship them, so an app adds dependencies
instead of files.

One piece ties the test kit to the app: a test person needs the app's own per-person data (the
dojo's `MemberProfile`). The user chose to solve that once for tests and production alike: **roux
publishes one event whenever a member joins**, and the app listens to it to make its profile, however
the member came (the first owner, an invitation, a test).

## Goals

- A new app's tests need no copied helper files: `roux-test` (Java, test scope) and
  `@jwcarman/roux-web/testing` (browser) provide them.
- Test people are made the way real members are: the same event, the same listener.
- An app's production code for "a member joined" is one listener, not a callback in the invitation
  controller plus a listener for the owner.
- The dojo shrinks by the copied files, and its tests keep passing unchanged in substance.

## Non-goals

- The route helper (`renderRoute`) and the app shell (session, guards, nav, layout): they depend on
  the app's route tree and shell, which is the separate "app shell" item.
- Playwright helpers.
- Members joining by self sign-up.

## Anti-goals

- A test-only path for making people that production never takes.
- A test kit that knows the app's tables or roles by name (the app passes its tables to `reset`;
  roles are found, not listed).
- Shipping test code in the app's production bundle or jar.

## Approaches (how the app gets its per-person data for test people)

1. A test-side callback bean `roux-test` calls when it makes a person. Simple, test-only; but tests
   make people differently from production, so the two drift.
2. **One event, `MemberJoined`, published wherever a member is created (chosen by the user).** The
   owner bootstrap, roux's invitation and `roux-test` all publish it in the creating transaction; the
   app listens once. Tests take the real path; production code shrinks too. Costs a new event and a
   small invitation service in roux.

## Decided with the user

- Server test kit and browser test kit move into roux (items 2 and 3 of the slimming list).
- The app's per-person data comes from one event, the same in tests and production (approach 2).

## The event and the invitation (roux-roles)

- `MemberJoined(UUID identityId, String name, String email)`, published synchronously in the
  transaction that creates the member, so a listener's writes commit or roll back with it.
- It **replaces `OwnerCreated`** (unreleased, so no deprecation): `OwnerBootstrap` publishes
  `MemberJoined` for the first owner.
- `MemberInvitations.invite(String name, String email, String role, Consumer<Identity> alsoInTransaction)`
  wraps who's `InvitationService.invite`: inside who's invitation transaction it publishes
  `MemberJoined`, then runs `alsoInTransaction` (the app's other work that must commit with the
  invitation, such as the dojo's "Invited" activity). An overload without the consumer. It answers
  whether the link was sent. The role check stays where it is (`InvitableRolesGuard`); an address
  already registered is refused as who refuses it (`EmailAddressTakenException`), for the app's
  controller to turn into a field error.
- The app keeps its invite controller (its permission, its request shape, its field errors), now a few
  lines over `MemberInvitations`.
- who-admin's own `POST /who/invitations` takes no name, so it publishes no `MemberJoined`; a member
  invited that way has no app profile. That is today's behaviour too; the guide says so.

## The server test kit (`roux-test`, test scope)

Moved from the dojo, generalised:

- `@AppTest`: `@SpringBootTest` on the app's own configuration, MockMvc, a fresh database per
  application context, `TestMembers`, `TestMail` and `TestClock`; `roux.owner.email` set to
  `TestMembers.OWNER_EMAIL`.
- `TestDatabase`: one PostgreSQL per run (Testcontainers, or an existing server from
  `ROUX_TEST_DATABASE_URL`/`_USERNAME`/`_PASSWORD`), a new database per context.
- `TestMembers`: `reset(String... appTables)` (empties who's tables and the app's, removes roles a test
  made, puts the clock back, re-runs the owner bootstrap); `signedIn(name, email, role)` (creates the
  identity, its address and role, publishes `MemberJoined` in a transaction, returns a signed-in
  browser); `owner()`; `anonymous()`.
- Which roles a test made is found, not listed: the roles that exist when the context starts (from the
  app's changelog and roux's) are kept; any other is removed by `reset`.
- `TestMember(id, browser)`, `TestMail` (the mail who sent, read by address), `TestClock` (a settable
  `Clock` bean, back to real time on `reset`).
- `roux-test` depends on who-test, spring-boot-test and Testcontainers' PostgreSQL module, so an app
  adds one test dependency instead of five.

## The browser test kit (`@jwcarman/roux-web/testing`)

roux-web's own internal helpers, published as an entry:

- the fake network: `server`, with `listen()`, `checkAllAnswered()` and `settle()` (a request no handler
  answers fails the test);
- `testQueryClient()`, `renderWithProviders()`, `renderHookWithProviders()`;
- problem answers: `invalidFields()`, `invariantViolation()`, `stale()`;
- `pageOf(rows, params)` for a paged answer;
- a setup module the app lists in Vitest's `setupFiles` (`@jwcarman/roux-web/testing/setup`): jest-dom,
  cleanup, the test organization before each test, the fake network's lifecycle and the unanswered-request
  check.
- `msw`, `@testing-library/react`, `@testing-library/jest-dom` and `vitest` are optional peer
  dependencies: an app that imports the entry already has them as dev dependencies; one that does not
  installs nothing.
- roux-web's internal `people`/`fakeEndpoint` fixtures stay internal.

## The dojo

- Deletes `AppTest`, `TestDatabase`, `TestMembers`, `TestMember`, `TestMail`,
  `RecordingWhoEmailSender`, `TestClock` (and their tests) and imports roux's; its test classes change
  imports only.
- `OwnerProfiles` becomes `MemberProfiles`, listening to `MemberJoined`.
- `InviteController` invites through `MemberInvitations`, its activity in `alsoInTransaction`.
- Its `testing/` folder keeps `route.tsx` (its routes and session); the rest comes from roux-web.

## Docs

- `testing.md` (and its plugin copy): dependencies instead of copied files; `@AppTest`, `TestMembers`
  and the browser kit as roux's API; a section on making the app's profile from `MemberJoined`.
- `roles.md`: `MemberJoined` (replacing `OwnerCreated`) and `MemberInvitations`.
- CHANGELOG (Changed: `OwnerCreated` → `MemberJoined`; Added: `roux-test`, `./testing`,
  `MemberInvitations`), the skill's task table, FINDINGS.

## Constraints

- roux's standing rules: 100% coverage per roux module, Stryker (incremental) on roux-web, every public
  name in a guide, no warning suppression, no star imports.
- `roux-test` is in the BOM, not the starter.
- The dojo frontend has no Prettier config: never run Prettier over it.

## My calls (for the user to check)

- The event's name, `MemberJoined`, and that it replaces `OwnerCreated` outright.
- `MemberInvitations` with an `alsoInTransaction` consumer, so app work like the "Invited" activity stays
  in the invitation's transaction without being part of the event (test people get no "Invited" entry,
  as today).
- who-admin's nameless invitations publish no event (unchanged gap, documented).
- Roles a test made are found by comparing with the roles present at startup, instead of the app
  listing its roles.
- The test database's variables become `ROUX_TEST_DATABASE_*`.
- `renderRoute` stays in the app until the app-shell work.

## Left to the builder

- Package names inside `roux-test` (`org.jwcarman.roux.test`).
- Whether `TestMail` keeps the dojo's API exactly.
- The setup module's exact name and how roux-web's own tests switch to the published entry.
