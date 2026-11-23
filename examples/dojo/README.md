# Dojo

A martial arts school's app, built on roux in roux's own repository, against the roux code beside
it: it is how roux finds out what is still hard for an app. It starts as a working shell, with
sign-in, roles, invitations, Appearance, Settings, activity and one small domain, the team's member
profiles, which sets the patterns the school's own features follow. The school's features came
round by round: ranks and students with their promotions; a weekly timetable and check-in; and plans
with prices, a student's membership and the payments taken at the desk (each student's "paid
through" date and whether they are overdue, the Students list's Payment filter, and money taken per
month on the owner's Payments page), with amounts as roux money (`docs/guides/money.md`).

It builds in roux's reactor (`./mvnw verify` from the repository's root) and is never published.

## What it has

- **Spring Boot 4.1** on Java 25, with virtual threads.
- **who** (passwordless sign-in), through `roux-spring-boot-starter`: email links (with typed
  codes), passkeys (P-256 and Ed25519), roles (`OWNER`, `MEMBER`), invitations, and passkey
  revocation. who's own security chain is the app's: a signed-out request gets `401` unless its path
  is in `who.security.public-paths` (application.yml), which lists the icons at the root; roux opens
  the SPA's shell and assets.
- **PostgreSQL** with a **Liquibase XML** schema (who's and roux-theme's tables from their own changelogs, run by migratory, then the app's), and
  **Spring Data JPA** with [jpa-utils](https://github.com/jwcarman/jpa-utils) for the app's own
  tables (Hibernate validates its mappings against the schema at startup).
- **Spring Session JDBC**: HTTP sessions live in that PostgreSQL database.
- A **React + Chakra UI v3** frontend, built into the jar and served by Spring Boot: sign-in, a
  signed-in landing page, settings (profile and passkeys) and a members page: a paged, searchable,
  sortable team directory, with an invite form for the owner. Vite's content-hashed files under
  `/assets/` are sent with `Cache-Control: public, max-age=31536000, immutable`, and the page itself
  with `no-store`, so a CDN in front of the app can hold the assets and a deploy still shows on the
  next page load. API responses stay `no-store`.
- A strict **Content-Security-Policy** on the shell, which roux serves (nothing in the app): scripts and
  styles must be the app's own files or carry the response's nonce, so a script injected into the
  page never runs; no plugins or framing. roux renders `index.html` per request: Vite writes the
  placeholder `__CSP_NONCE__` on every tag it emits (`html.cspNonce`), and roux swaps in a fresh
  128-bit nonce matching that response's header; that is why the page is never stored. Code that adds
  a `<style>` or `<script>` at runtime takes the nonce from `cspNonce()` (`ThemeProvider` sets up
  Emotion's cache with it; next-themes gets it in `colorMode.tsx`). A small inline script in
  `index.html` sets light or dark mode before the first paint. The look is the owner's to choose, on
  the **Appearance** page (permission `theme.manage`, given to `OWNER`), which is roux's
  `<AppearanceSettings />` inside this app's route: a ready-made look, or the color, the corners, the
  lettering and the app's name. roux-theme keeps it in its own table, `roux_theme` (`/api/theme`), and
  roux writes it into every page (`#app-theme` and the title), so `ThemeProvider` builds the Chakra
  system from it before the first paint. Until the owner saves one, the app is `gray` and named by
  `roux.theme.app-name` (application.yml). Components use `colorPalette.*` and semantic tokens, never
  a named palette (a test enforces it), so every one follows the owner's choice. A header button
  switches light and dark mode, which follows the system's until the user picks one.
- A **Playwright** suite that drives all of it in Chromium, with Chrome's virtual authenticator for
  passkeys and Mailpit for email.

## Adding a feature

Member profiles (`src/main/java/org/jwcarman/roux/examples/dojo/members`, `frontend/src/members`)
are the worked example. Copy their shape:

- **One folder per feature, on both sides.** The Java package
  `org.jwcarman.roux.examples.dojo.<feature>` and the frontend folder `frontend/src/<feature>/`
  hold the feature's code and its tests: `members/` (the directory, member pages and dialogs,
  `members.ts` for its calls, passkeys), `activity/` (the history list), and `shell/` for the app's
  frame (layout, nav, session, guards, colour mode, the sign-in and Appearance pages, Settings).
  `frontend/src/routes/` keeps TanStack's route files, each a thin file that opens its feature's
  page; `main.tsx`, `api.ts`, `queryKeys.ts` and `testing/` are shared.

- **A table keyed by the identity.** roux-users' `roux_user` row (a user's name) has its user's
  identity id as its `id`, a foreign key to `who_identity` with `ON DELETE CASCADE`, so deleting an
  identity deletes its row. A new kind of person who signs in (a coach with a belt) gets a table of
  its own keyed the same way (`@MapsId` to roux's `AppUser`), and a role of its own.
- **A write entity.** roux's `AppUser` extends jpa-utils' `AuditableEntity` (`id`, `@Version`,
  created and modified date and by), passing the identity id to its constructor. It has no
  setters: `rename` enforces the name rule, and the request records repeat it with Bean Validation
  so clients get field errors. The dojo's own write entities (ranks, students, classes, plans)
  follow it.
- **A read model for screens that combine tables.** roux's user directory joins `roux_user` to
  who's identities, addresses and roles in the `roux_user_directory` view, mapped by the `@Immutable`
  entity `UserDirectoryEntry` (a `BaseEntity`, with the user's `id` and `version`): paged, searched
  and sorted in SQL, not N+1 in Java. The view reads who's tables directly; a who release that
  renames them fails Liquibase or Hibernate's `validate` in CI.
- **Lists use jpa-utils.** `PageParams` in, `PageDto` out, sorts named by an enum (`PaymentSort`),
  through one `Paginator` per list (`Paginator.of(entity, sort enum, cfg -> cfg.defaultSort(...))`),
  which checks the sort's property paths against the entity when it is built, then
  `paginate(spec, repository search, mapper)`. Paginator sorts by `id` last, so rows that sort equal
  keep their place from page to page.
- **Navigation is a left sidebar** (`frontend/src/shell/Layout.tsx`): full from `lg`, an icon rail
  at `md`, a drawer behind a menu button on a phone. Its items come from one list,
  `frontend/src/shell/nav.ts` (`defineNav`): a label, a route, an icon component and the permission the
  page needs (an item is hidden from callers without it). `to` is checked against the routes,
  `permission` against `PERMISSIONS` in `api.ts`. A new feature's page is one more entry there.
- **Routes are TanStack Router files** (`frontend/src/routes`, file-based; the Vite plugin
  generates `routeTree.gen.ts`, which is committed as TanStack recommends). A route's `beforeLoad`
  guards it with `shell/guards.ts` (`requireSignedIn`, `requirePermission`); pages under
  `_signedIn/` need a signed-in caller. A new route is the route file alone: roux's SPA
  filter serves the shell for any page URL, signed out too, and the app sends the visitor to sign in.
- **List state lives in the URL.** The members route declares its search params with
  `validateSearch: (raw) => tableSearchOf(raw, MEMBER_SORTS)` (unknown sorts and bad pages are
  dropped) and leaves defaults out of the URL with `stripSearchParams`; the page hands them to
  `QueryTable` as `params` and writes changes back with `navigate`. A reload, Back and a shared
  link keep the page, sort and search.
- **Forms use `useSchemaForm`** (`@jwcarman/roux-web/form`): a Zod schema built from roux's rule
  helpers (`text()`, `email()`, `.max(n)`, `.optional()`, whose messages are the server's), the
  mutation that saves it, and a `<form.AppField>` per field. `useSchemaForm` validates, submits
  through the mutation, puts a 400's field errors under their fields, toasts any other refusal
  and starts over on a 409. In a dialog the fields go in `FormDialog`, which closes after a save
  and stays open on a mistake (`members/InviteForm.tsx`); on a page they go in
  `<form.AppForm><form.Form>` with `<form.SubmitButton>` (`members/ProfileForm.tsx`). A form that
  does not save through a mutation (sign-in, Settings) uses `useAppForm`, the hook underneath.
  roux's [Forms guide](../../docs/guides/forms.md) has the rest.
- **Lists on the client use `QueryTable`** (`@jwcarman/roux-web/table`), TanStack Table over
  TanStack Query: column definitions whose ids are the sort enum's values, a
  `DebouncedSearchInput`, and a key from `queryKeys` that includes the search, so a new search
  starts on the first page. The server pages and sorts; a mutation refreshes the lists with
  `invalidateQueries({ queryKey: queryKeys.<thing>.lists() })`. Alongside it:
  - `SimpleQueryTable` for a short list fetched whole and sorted in the browser;
  - `fetchAllPages` (`@jwcarman/roux-web/paging`) for every row of a paged endpoint, 100 at a time;
  - `InfiniteList` for a list that grows a page at a time;
  - `InfiniteSelect` for picking one item from a paged endpoint;
  - `createSelectColumn` for choosing rows across pages, by id.

  The query cache is cleared when the signed-in identity changes or signs out.
- **A detail page per record.** `/members/$memberId` (`routes/_signedIn/members/$memberId.tsx`):
  the loader `ensureQueryData`s the record through a query-options factory (`memberQuery` in
  `members/members.ts`) and throws `notFound()` on a 404, which shows "Member not found" in the frame;
  the page reads it with `useSuspenseQuery`. Names in the directory link to it.
- **The team is roux's users.** The Members pages call roux-users' endpoints under `/api/users`
  (list, detail, invite, rename, deactivate, reactivate; see roux's
  [Users guide](../../docs/guides/users.md)): the dojo keeps no profile table, directory or invite
  endpoint of its own. Deactivate and Reactivate go through who; a deactivated member is signed out
  on their next request and cannot sign in. "You cannot deactivate yourself" is a 400, and the last
  active owner is kept by who-admin's `LastAdminGuard`: deactivating them is a 409 problem with code
  `last-admin` ("The team needs someone active who can manage people").
- **A history of changes.** `ActivityLog.append(anchor, activity)` writes in the changing
  transaction (it refuses to run outside one); `ActivityLog.history` pages it newest first with each
  actor's name. roux records invites, renames and status changes against the user, shown by
  `ActivityList` on the member's page.
- **Actions use `useServerAction`** (`@jwcarman/roux-web/api`), a TanStack Query mutation:
  `{ request, failure, refreshes, onSuccess }` gives `{ run, pending }`. A refusal toasts the
  server's reason, and either way the named queries are refreshed. Deactivate and Reactivate on the
  member's page are the example.
- **Feedback** (`@jwcarman/roux-web/feedback`). `notify.success` and `notify.error` toast the outcome of an action, and
  `notify.problem(problem, fallback)` toasts a failed request's detail (with its reference on a 500); field mistakes
  stay under their fields. `useConfirm()` asks before a destructive action (an alert dialog, Cancel
  focused first, `DANGER_PALETTE` for the button). See roux's
  [Feedback guide](../../docs/guides/feedback.md).
- **Filters and export.** `FilterChips` binds a filter to the URL (Status and Role on Members, with
  `enumSearchOf` dropping unknown values; the server answers an unknown enum with a 400 field
  message). `ExportButton` downloads `GET /api/users/export.csv` (the dojo's `UsersExportController`, over
  roux's `UserDirectory` and `UserFilter`): the list's search, filters and sort, unpaged, written by `Csv` (UTF-8 with a BOM for Excel, RFC 4180 quoting, formula escaping),
  capped at `app.export.max-rows`.
- **Errors and not-found pages.** The root route shows "Page not found" and "Something went wrong"
  (with Try again); a signed-in browser's typed bad URL reaches the same page.
- **One icon set.** Icons come from `react-icons/lu` (Lucide), enforced by `icons.test.ts`.
- **A permission per capability, never a role check.** roux's `users.read`, `users.invite` and
  `users.manage`, and the dojo's own (`classes.read`, `payments.record`, ...), gate the endpoints with
  `@RequiresPermission`. The dojo's constants live in `Permissions`; which role holds which is data, granted in `db/changelog/roles.xml` (OWNER
  is roux's, and roux's modules grant it their own). `PermissionsTest` fails when OWNER lacks a
  constant or a role grants one that does not exist, and `PermissionsListTest` writes
  `frontend/src/permissions.gen.ts` from the constants. A role that holds none of them is shut out of the members area with no code
  changes.
- **Identity from the session.** `/api/users/me` acts as the signed-in identity, so nobody edits
  another member's name; an action on another member names them by id and needs its permission
  (`users.manage` to deactivate).
- **Optimistic locking.** The client sends back the `version` it read; a stale one answers 409,
  the only 409 an app's own code causes. The client reloads the record and asks again.
- **Errors are RFC 9457 Problem Details** (roux's `org.jwcarman.roux.problems`, through
  `roux-spring-boot-starter`). Its `ProblemsAdvice` and the catch-all `RootProblemsAdvice` answer every error as `application/problem+json`, with `title`, `status`,
  `detail` and `instance`. A 400 lists `errors: [{field, message}]`, and a 500 carries an `errorId`
  that is also in the log, never the exception's message. A feature adds no handlers of its own:
  - throw `NotFoundException("No such student")` (404), or, for a rule the request breaks,
    `InvariantViolationException("A class meets at most %d times a week", 7)` (a 400 whose detail is
    the formatted message) or its subclass `InvalidFieldException("note", "Must be at most %d
    characters", 500)` (a 400 field error, for a rule Bean Validation cannot state);
  - put Bean Validation constraints on request records and on `@Validated` service parameters
    (roux supplies their English messages in `ValidationMessages.properties`);
  - take ids as `@PathVariable UUID id`, where a malformed id is a 404.

  who answers its own errors under `/who` as Problem Details (with a `code`); on the app's own endpoints its
  exceptions answer through roux's advices. JSON responses that reach `/error` are
  problems too (roux's `ProblemErrorController`). On the client, `problemOf(response)`
  (`@jwcarman/roux-web/problem`) reads any failed
  response, and `ApiError.problem` carries it for `getJson`.
- **Tests at each layer:** entity unit tests, Testcontainers tests for the view and repositories,
  `WhoMockMvcBrowser` tests for permissions (401 and 403), validation and conflicts, Vitest tests
  for the client (components and hooks in jsdom with Testing Library), and Playwright scenarios.

A user's email is not copied: roux's directory reads the oldest of their addresses from who, so a
change through who's `/who/me/email-addresses` shows up at once.

## Prerequisites

- **Docker**, for PostgreSQL and Mailpit (`compose.yaml` in development, Testcontainers in tests).
- **JDK 25**.

Node and npm are downloaded by the build (`frontend-maven-plugin`); you do not need them installed.

## Running in development

From the repository's root, build roux once (`./mvnw install -DskipTests`), then:

```bash
cd examples/dojo
../../mvnw spring-boot:run -Dspring-boot.run.arguments="--roux.owner.email=you@example.com --roux.owner.name=You"
```

`spring-boot:run` turns on the `dev` profile (`application-dev.yml`), which lets the session cookie
travel over plain HTTP. Spring Boot starts PostgreSQL and Mailpit from `compose.yaml` by itself. The
app is at
<http://localhost:8080>. `roux.owner.email` and `roux.owner.name` are required: on first start roux makes that
address the `OWNER`, with that display name, and the dojo gives it a member profile. Request a sign-in link for it and read the email in Mailpit at
<http://localhost:8025>.

If port 1025 or 8025 is taken, set `MAILPIT_SMTP_PORT` and/or `MAILPIT_WEB_PORT` before starting.
`compose.yaml` maps Mailpit to those ports, and the app reads `MAILPIT_SMTP_PORT` for its SMTP port,
so one variable moves both sides. `POSTGRES_PORT` does the same for PostgreSQL.

For frontend work with hot reload, run `npm run dev` in `frontend/` as well: Vite serves the UI on
<http://localhost:5173> and passes the API and who's endpoints through to Spring Boot on `:8080`.
Passkeys need the page's origin in `who.passkey.allowed-origins`; it defaults to `app.base-url`
(`http://localhost:8080`).

## Production

Run the jar with `SPRING_PROFILES_ACTIVE=prod` (`application-prod.yml`) and
set these variables. None has a default. A missing one fails startup, except `PASSKEY_RP_ID`: who
0.19 starts with the unresolved `${PASSKEY_RP_ID}` as the relying party, so set it.

| Variable | Sets | Example |
|---|---|---|
| `APP_BASE_URL` | `app.base-url`; links and `who.passkey.allowed-origins` follow it | `https://app.example.com` |
| `APP_OWNER_EMAIL` | `roux.owner.email`, the first `OWNER` | `owner@example.com` |
| `APP_OWNER_NAME` | `roux.owner.name`, the first `OWNER`'s display name | `Olive Owner` |
| `PASSKEY_RP_ID` | `who.passkey.rp-id`: the app's own host, not derived from the base URL | `app.example.com` |
| `MAIL_FROM` | `who.email.from`, the one sending address | `mail@example.com` |
| `WHO_CODE_SECRET` | `who.email-link.code-secret`, the key for typed sign-in codes; at least 32 characters, from `openssl rand -base64 32` | |
| `MAIL_HOST`, `MAIL_PORT`, `MAIL_USERNAME`, `MAIL_PASSWORD` | `spring.mail.*` (SMTP with STARTTLS required) | `smtp.example.com`, `587` |
| `SPRING_DATASOURCE_URL`, `SPRING_DATASOURCE_USERNAME`, `SPRING_DATASOURCE_PASSWORD` | the PostgreSQL database | |

The session cookie is `Secure`, `HttpOnly` and `SameSite=Lax` in every profile but `dev`, so serve
the app over HTTPS. Rate limiting of the sign-in endpoints belongs at the ingress (see who's email
links guide).

## Sessions

Sessions are stored in the app's PostgreSQL database by Spring Session JDBC
(`spring-boot-starter-session-jdbc`), not in the server's memory. A signed-in browser therefore
stays signed in across a restart or a redeploy, and any instance of the app on the same database
can serve it; no sticky sessions are needed.

- **What is in a session.** who keeps its `WhoSession` (identity, credential, sign-in time and
  method, and the id of its record in who's `who_session` table) under `org.jwcarman.who.session`,
  and the identity id under Spring Session's principal-name index
  (`FindByIndexNameSessionRepository.PRINCIPAL_NAME_INDEX_NAME`); it looks the caller and the
  session record up again on every request, so a role change, a revoked credential or an ended
  session takes effect on the next request, not at the next sign-in. The passkey ceremony's options
  can sit beside them after `/who/passkey/sign-in/options`. who saves no denied request in the
  session. Attributes are stored with Java serialization.
- **Timeout.** A session ends after 30 minutes without a request (`server.servlet.session.timeout`
  in `application.yml`; Spring Session uses it because `spring.session.timeout` is unset). Spring
  Session deletes expired rows every minute (its default `spring.session.jdbc.cleanup-cron`).
- **Tables.** `SPRING_SESSION` and `SPRING_SESSION_ATTRIBUTES` are created by Liquibase
  (`db/changelog/spring-session.xml`), with Spring Session's own PostgreSQL
  DDL and default table names. Spring Session's own initializer is off
  (`spring.session.jdbc.initialize-schema: never`).
- **Cookie.** The session cookie is Spring Session's `SESSION` (its value is the base64-encoded
  session id), with the `server.servlet.session.cookie.*` settings above.
- **Signing everyone out.** Deleting the rows (`delete from spring_session`) ends every session.
  To sign out one identity everywhere, use who's `WhoSessions.endAll`.

## Known limits

- **Invitations.** `POST /api/users/invitations` is roux-users': it invites through roux's
  `UserInvitations`, outside any transaction, over who's `InvitationService.invite`, which creates the
  identity, registers the address, assigns the role and publishes `IdentityInvited` in one
  transaction, then sends the link after it commits. roux's `UserJoined` listener makes the user's
  name, and the "Invited" activity is written in the same transaction, so a failure rolls the
  invitation back and no email is sent. roux's guard refuses any role outside `roux.roles.invitable`
  for an invitation made any other way (who's own `POST /who/invitations`), which gets no name. The invite form asks `GET /api/roles/invitable` for the roles to offer. An invitation is a who sign-in link, so it expires with who's token TTL (5
  minutes by default); an invited member who opens it later is sent to sign in, which works because
  the address is registered. If the email cannot be sent, the member is still added and the answer
  says so (`{"linkSent": false}`): the owner is told to have them sign in from the sign-in page, and
  the app logs a warning with who's `EmailLinkOutcome` (never the address). Deactivating and
  reactivating stay in `MembersController` over `WhoService`, because the app's own rules (the
  status lock, and the last owner through who-admin's guard) and its activity log belong to the
  same transaction; who's `PATCH /who/identities/{id}` (who-admin) runs the same guard but writes
  no activity.
- **The owner.** `roux.owner.email` makes the first owner: roux creates one only while no active
  identity holds `OWNER`, and the dojo's `OwnerProfiles` gives it a profile in the same transaction.
  Once an active owner exists, changing `roux.owner.email` changes nothing; if none is active (the
  database was changed by hand), the next start makes that address the owner again, and fails
  naming `roux.owner.email` when another identity already holds it.
- **Request sizes.** Cap request bodies and headers at the ingress.

## Tests on the JVM

From the repository's root:

```bash
./mvnw verify                         # roux and the dojo
./mvnw verify -pl examples/dojo -am   # the dojo and the roux modules it uses
```

Each runs the unit and slice tests, then `E2eIT`: PostgreSQL and Mailpit in Testcontainers, the app in
the test's JVM on a free port, and the Playwright suite in `e2e/` against it. Playwright's output is
in `target/playwright.log`.

Spring tests are annotated `@AppTest`: the whole app on a test database, with MockMvc. Test
classes with the same configuration share one running app and its database, so each test starts
from a clean slate:

```java
@AppTest
class StudentsTest {
  @Autowired TestUsers users;
  @Autowired TestClock clock;

  @BeforeEach
  void cleanSlate() {
    users.reset(); // every user gone, the app's tables emptied, the owner made again
    clock.set("2026-11-10T17:32:00Z"); // optional: the app's clock stops here
  }

  @Test
  void anInstructorCannotAddAStudent() throws Exception {
    TestUser ada = users.signedIn("Ada Park", "ada@example.com", AppRole.INSTRUCTOR);
    ada.perform(post("/api/students")...).andExpect(status().isForbidden());
  }
}
```

`users.signedIn(name, email, role)` makes a user with a profile and returns their browser
([`who-test`](https://jwcarman.github.io/who/guides/testing/)'s `WhoMockMvcBrowser`, which holds
their session cookie and echoes the CSRF cookie into `X-XSRF-TOKEN` as the SPA does);
`members.owner()` signs in the owner the app makes at startup, and `members.anonymous()` is a
browser with no one signed in. `TestClock` runs on real time (UTC, as who's clock does) until a
test sets it, and `reset` starts it again. A class that needs other properties adds
`@TestPropertySource`, and a real port `@AppTest(webEnvironment = RANDOM_PORT)`; each such class
gets an app and a database of its own.

Client tests fake the server with [Mock Service Worker](https://mswjs.io/) (MSW), the usual way
to fake HTTP in React tests: the app's own `fetch` calls run, and a handler answers them. The
fake network (`frontend/src/testing/server.ts`) starts empty for each test; a test answers what it
expects with `server.use(http.post("/api/...", () => HttpResponse.json(...)))`, and a request no
handler answers fails the test, even when the app catches the failure. After each test the setup
waits (up to a second) for requests still in flight, so an answer never lands after the test is
gone. `testing/problems.ts`
builds the server's Problem Details answers (`invalidFields`, `invariantViolation`), and
`testing/fakeServer.ts` builds paged answers (`pageOf`) and paged endpoints for components that
take a fetch function.

A route is tested by opening its URL, as TanStack's
[guide to testing file-based routing](https://tanstack.com/router/latest/docs/framework/react/how-to/test-file-based-routing)
does: `renderRoute("/members", { permissions: [MEMBERS_READ] })` (`testing/route.tsx`) builds
the router from the generated route tree on an in-memory history, signed in with those permissions
(or signed out, with `null`), inside the app's providers. The test checks what the caller sees, or
where `router.state.location` ended up. Its file sits beside the route and starts with `-`
(`routes/_signedIn/members/-index.test.tsx`), so the router plugin does not take it for a route.
Under Vitest the plugin leaves out its hot-reload code, so a route file's coverage is only its own
code.

`-DskipTests` skips all of it (the Vitest run and the Playwright install too), so
`./mvnw -DskipTests package` only builds. `-DskipITs` keeps the unit tests and Vitest and skips
`E2eIT` and its Playwright setup.
