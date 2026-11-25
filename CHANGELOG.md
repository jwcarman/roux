# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Added

- **Active members by id, for a feature that refers to people.** `users.MustBeActive(ctx, db,
  field, ids)` refuses ids that are not active members (400 on the field, "Must be active members
  of the team"); `users.Members(ctx, db, ids)` names them, by name, with whether each is still
  active.
- **`rouxtest`, for an application's own tests.** `rouxtest.New(t, schema, migrations...)` is
  the app's features over a fresh schema with roux's tables; `Role(name, permissions...)`,
  `Person(name, role)`, `Deactivate`, `At(moment)`, `Migrate` and `Kit()` (to mount the app's
  routes) on top of authntest's signed-in browsers.
- **A paginator for a table or view, as jpa-utils' in Java.** `page.New(page.ListConfig{From,
  Columns, Sorts, DefaultSort, Search, Scan})` declares a list once; `Check` runs its queries at
  startup so a misspelled column fails there; `Page(ctx, db, req, search, filters...)` returns a
  page with the count, the search (`page.Contains`, `Prefix`, `Exact`, every word in some field),
  ORDER BY with `id` as the tiebreaker, LIMIT and OFFSET. Filters are `page.Where("day < ?",
  today)` and `page.WhereIf(cond, ...)`: SQL text is a constant, values are always arguments.
- **An app's whole `main` in one call.** `app.Main(app.Config{Name, DisplayName, Frontend,
  Modules})` sets up logging and telemetry, the health probes, the database, the modules, the
  front end and a bounded server, and shuts down gracefully; `app.Run(ctx, cfg)` is the same
  without the signals and the exit. The template's `main.go` is that one call: an app made before
  this can replace its `run` with it, keeping `modules`.
- **Guarded routes in one call.** `kit.Handle(pattern, permission, fn)` mounts an application
  route behind the CSRF check, a sign-in and the permission, so no route is mounted half
  guarded; an empty permission panics at startup. `kit.HandleSignedIn` is for anyone signed in,
  `kit.HandlePublic` for anybody. `Mux.Handle` still mounts a route as it is, but startup logs
  a warning naming each one (`Mux.Unguarded`); `Mux.HandleGuarded` is for a handler that guards
  itself.
- **Sessions have a lifetime.** `authn.Config.SessionLifetime` (default 12 hours) ends a session
  however busy it is, so a stolen cookie kept warm still dies. `authn.EndSessions` ends an
  identity's sessions inside a transaction.

- **"An email address was added" email.** Confirming a new address emails every address already
  on the account, with the new one masked, as replacing one does: an added address is a way in.
- **"An API key was made" email.** Making or rotating a key emails the owner
  (`apikey.Config.Notify`, wired to `emaillink.Method.APIKeyMade` by `app.APIKeysFromEnv`), as
  adding a passkey does.

- **`app.Server`**: the HTTP server with every connection bounded (headers 10 s, request 30 s,
  answer 60 s, idle 120 s) and, over HTTPS, HSTS for a year. The template's `main` uses it: an
  app made before this sets only `ReadHeaderTimeout`, so change its `http.Server` to
  `app.Server(addr, handler, secure)`.

### Changed

- **The template's development services stay on this machine.** `compose.yaml` publishes every
  port on 127.0.0.1 only and pins each image to a release (Postgres 17.6, Mailpit v1.34.0,
  Keycloak 26.0.8, otel-lgtm 0.41.1, the collector 0.165.0); a test in `cmd/server` reads the file
  as YAML and keeps it so, whichever way a port is written.
- **Plain HTTP for a real host must be on purpose.** A `PUBLIC_URL` of `http://` for a host other
  than this machine stops startup, saying to serve over HTTPS, unless `COOKIE_SECURE=false` says
  so; then a warning is logged. Localhost is unaffected.
- **A client's trace is linked, not joined.** `telemetry.HTTP` starts each request's own trace,
  linked to any `traceparent` the client sent, and takes in no client baggage: anyone may send
  those headers. Behind a gateway that starts the traces, `TRACE_TRUST_INBOUND=true` continues
  them as before.
- **API answers are `nosniff` and `no-store`** unless their handler sets its own caching, and a
  static file opened on its own (a stray `.html` or `.svg`) is sandboxed by its own CSP (a script is not, so it can run as a worker).
- **Managing users reaches only the people beneath you.** Every change to a person (role,
  deactivate, reactivate, rename, sign out everywhere) needs, for an owner, `users.owners` and a
  recent sign-in, as making an owner does; for anyone else, every permission they hold. Otherwise
  it is a 403. Inviting someone or changing a role refuses a role holding a permission the caller does
  not (400 on `role`), so granting `users.manage` or `users.invite` to a lesser role cannot
  escalate.
- **A bearer token needs a recent sign-in to make or rotate an API key,** as a browser does: the
  token's `auth_time`. A leaked access token could otherwise turn itself into a key lasting a year. An
  `auth_time` later than the token's issue time (beyond a minute's skew) is not believed.
- **Deactivating someone ends their sessions at once,** not at their next request: reactivated
  before then, they used to come back signed in.
- **Dead sessions are cleared.** A sign-in deletes sessions that ended, idled out or outlived
  their lifetime more than 30 days ago.

### Fixed

- **A huge `pageIndex` is an empty page,** not a 500: the offset stops at Postgres's limit
  instead of overflowing negative.
- **Error answers name no Go types.** A body that does not decode says what is wrong in the
  client's terms ("item has the wrong type", "a member this endpoint does not take: x", 413 for
  over 1 MiB), and an `apperr` sentinel answers with its own words only, not the context it was
  wrapped with.

## [0.3.0] - 2026-11-24

Upgrading from 0.2.0: read **Breaking changes** first. Each entry says what a roux app changes.

### Breaking changes

- **who 0.26.0 (was 0.15.0), brought by the starter.** `roux-spring-boot-starter` brings
  `who-spring-boot-starter`, both sign-in methods (`who-email-link`, email links and typed codes, and
  `who-passkey`), `who-admin` and `who-email`: drop your own who dependencies, or keep them without a
  version. `@jwcarman/who-client` is 0.25.0. Read who's
  [upgrading guide](https://github.com/jwcarman/who/blob/0.26.0/docs/guides/upgrading.md) for the
  full list. What changes for a roux app:
  - Sign-in needs its settings, or startup fails: `who.email-link.link-base-url`,
    `who.email-link.code-secret`, a way to send email, and `who.passkey.rp-id`.
  - who's endpoints are under `/who` and REST-shaped, with no aliases: `/ott/generate` is
    `/who/email/send`, `/logout` is `/who/logout`, and the person's own things are under `/who/me`
    (`/who/me/sessions`, `/who/me/passkeys`, `/who/me/email-addresses`, `/who/me/accounts`,
    `/who/me/api-keys`; a passkey is registered with `POST /who/me/passkeys/options` then
    `POST /who/me/passkeys`). `@jwcarman/who-client` has the account calls under `client.me.*`.
  - `/who/me` and the admin endpoints are Spring MVC controllers: the app's `authorizeHttpRequests`
    rules apply to them (never deny `/who/**`), and an app controller on their paths, a path prefix
    or `spring.mvc.servlet.path` that moves them fails startup. An app with no `SecurityFilterChain`
    of its own gets who's.
  - Under `/who`, who answers every error itself as Problem Details (`type` `urn:who:error:<code>`,
    `title`, `status`, `detail`, `code`); `invalid-request` replaces `invalid-admin-request`,
    `invalid-api-key-request` and `invalid-invitation`. `WhoProblemsAdvice` answers only who's
    exceptions on the app's own endpoints (sign-in failed, reauthentication required).
  - Email: `who-email` renders who's emails and roux-email finishes them (see Added). SMTP delivery
    stays the app's choice: add `who-email-smtp` beside `spring-boot-starter-mail`, or write a
    `WhoEmailSender`, which now only delivers a rendered `OutgoingEmail` (`to`, `subject`, `text`,
    `html` or null, `source`). `EmailLinkSender` is `WhoEmailSender`; `MailWhoEmailSender` is
    `SmtpWhoEmailSender`; `WhoEmailTemplates` is `WhoEmailTemplatesContributor`. `who.email.from`
    replaces `who.email-link.from` and `who.passkey.from`; subjects are message keys
    (`who.email.<template>.subject`).
  - Libraries' tables are created by [migratory](https://github.com/jwcarman/migratory) 0.1.0, which
    who brings, before the app's changelog. Remove the include of who's changelog
    (`classpath:org/jwcarman/who/db/who-changelog.xml`) from the master changelog, and the
    `who.initialize-schema` setting; paths are unchanged, so an existing database runs nothing again.
    who adds a `who_session` table. `spring.liquibase.enabled=false` turns off only the app's
    changelog and `migratory.enabled=false` the libraries' (the app then includes their changelogs),
    so a test profile that kept Liquibase off the database sets both. `spring.liquibase.drop-first`
    fails startup; `migratory.drop-first=true` rebuilds a development database instead.
  - A passkey label is 1 to 64 characters, not blank, with no control characters.
- **Roles and permissions** (`docs/guides/roles.md`):
  - Set `roux.owner.email` and `roux.owner.name` (both required; startup fails naming the missing
    one). While no active identity holds `OWNER`, roux creates one at startup. Delete the app's own
    owner bootstrap.
  - Set `roux.roles.invitable` to the roles an invitation may give. It is empty by default, so every
    invitation is refused until it is set; `OWNER` may not be listed.
  - The app's roles move to a Liquibase changeset that creates them and grants their permissions by
    name (`ON CONFLICT DO NOTHING`), and grants `OWNER` the app's own permissions. Remove startup
    code that creates or syncs roles.
  - Deactivating someone or removing a role goes through who-admin's `LastAdminGuard`, which refuses
    to leave no active identity that may manage people (only `OWNER`, by default). roux answers
    `LastAdminException` as a `409` with code `last-admin`.
- **Users** (`docs/guides/users.md`): roux-users, in the starter, keeps each user's name and serves
  the users endpoints (see Added). Delete the app's own profile table, user directory, invite endpoint
  and actor names; move each profile's name into `roux_user` in a changeset; grant `users.*` to the
  app's roles and list `RouxUserPermissions` in its roles test.
- **The organization's time zone and locale** (`docs/guides/dates-and-time.md`):
  - Set `roux.organization.time-zone` (an IANA zone, `America/New_York`) and
    `roux.organization.locale` (a BCP 47 tag, `en-US`). Both are required; startup fails naming a
    missing or unknown one, a fixed offset (`+05:00`, `UTC+3`) for the zone, or a tag written another
    way (`en-us`).
  - In `main.tsx`, `await loadOrganization()` and `startDayWatch(queryClient)` before `render`; in the
    Vitest setup, `beforeEach(() => setOrganization(testOrganization()))`.
- **roux serves the app's shell** (roux-spa, in the starter). `static/index.html` must carry the four
  placeholders `__CSP_NONCE__`, `__APP_THEME__`, `__APP_NAME__` and, after `#app-theme`,
  `<script type="application/json" id="app-context">__APP_CONTEXT__</script>`; a page without them
  fails startup. Delete the app's own shell controller, its header writer, and any page paths listed
  in `who.security.public-paths`: roux answers every page URL with the shell, nonce and
  Content-Security-Policy included (see Added).
- **roux-web's list components take the resource module's query**, not a key plus a fetch function.
  `pageQuery(queryKey, (params, signal) => ...)` now builds it and returns a `PageQuery<T>` (`queryKey`
  and `fetch`); the old `pageQuery(params)`, a URL query string for an export link, is
  `queryStringOf(params)`. `QueryTable` and `useQueryTable` take `query: PageQuery<T>` (replacing
  `queryKey` and `query`), `InfiniteList` takes it in place of `queryKey` and `fetchPage`, and
  `InfiniteSelect` in place of `queryKey` and `queryFn` (`InfiniteSelectQuery` is gone; its
  parameters are `PageParams`). `SimpleQueryTable` takes `query` as the list's TanStack query options
  (pass the module's `queryOptions(...)`). Every page fetch receives the `AbortSignal`, so a page no
  longer needed is cancelled.
- **roux-web has new peer dependencies:** `date-fns` `^4.4.0`, `@tanstack/react-router`
  `^1.170.46`, `@jwcarman/who-client` `^0.25.0`, `culori` `^4.0.2`, `@emotion/cache` `^11.14.0`, and
  the fonts `@fontsource-variable/inter`, `lora` and `nunito` `^5.3.0`. The browser test kit's
  (`vitest`, `msw`, `@testing-library/react`, `@testing-library/jest-dom`) are optional.
- **`NotFoundException` takes a format pattern and its arguments**, as `ConflictException`,
  `InvariantViolationException` and `InvalidFieldException` do: `new NotFoundException("No student %s",
  id)`. A call with a plain message compiles and reads as before; code compiled against 0.2.0 must be
  recompiled.

### Added

- **`npm create @jwcarman/roux-app acme-gym` starts a new app** (`@jwcarman/create-roux-app`): roux's
  app template at the same release, named after its directory (or `--name "Acme Gym"`), with a Maven
  wrapper and a first commit. Its roles test is `PermissionsTest` (the grants, on the database) and
  `PermissionsListTest` (writes `permissions.gen.ts` without Docker), both reading
  `PermissionClasses.ALL`. `docs/guides/getting-started.md` opens with "Start a new app".
- roux's features are modules of their own, each switched on by its jar (the auto-configuration stays
  in roux-autoconfigure). The starter and roux-bom carry them all, except `roux-theme` and `roux-test`,
  which an app adds itself:
  - `roux-validation`: `@Phone` (the browser's `phone()` rule, the same pattern `Phone.PATTERN` and
    message, held to the same examples by `contracts/phone.json`), `@NotInFuture` for a `LocalDate`
    (`Must not be in the future`, against the organization's today) and class-level
    `@After(field, other, otherLabel)` (`Must be after {other}` on the later field; `LocalTime`,
    `LocalDate`, `Instant`, numbers, any `Comparable`), with roux's validation messages.
  - `roux-jpa`: `Versions.require(entity, request.version())`, the stale-version check every edit
    makes (no version is a field error on `version`, an old one the 409). `IdentityAuditor`,
    registered for you, records the signed-in identity's id (or `"system"`, or
    `roux.auditing.system-auditor`) in `@CreatedBy` and `@LastModifiedBy`, so an app writes a plain
    `@EnableJpaAuditing`; an `AuditorAware` of its own is kept. `@CreatedDate` and
    `@LastModifiedDate` come from the app's `Clock` bean (`ClockDateTimeProvider`).
    `Idempotent.insert(entityManager, key, exists, insert)` takes a transaction-scoped PostgreSQL
    advisory lock on the key, then checks and inserts, so a race never meets the unique constraint.
  - `roux-spa`: the app's shell for any page URL, so a route is written once, in the frontend. A GET
    or HEAD that accepts `text/html`, has no file extension and is not under `/api`, `/who`,
    `/assets`, `/actuator`, `/.well-known` or `/error` (or `roux.spa.excluded-paths`) gets
    `index.html` with the request's nonce, the theme and the app's name, `Cache-Control: no-store`
    and a strict Content-Security-Policy, extended only by `roux.spa.csp.*` properties (a wildcard or
    an unsafe keyword stops startup). `/assets/**` is cached for a year, and `/index.html` and
    `/assets/**` are who's public paths. The theme comes from a `ShellThemeSource` bean or the
    `roux.theme.*` properties.
  - `roux-organization`: `OrganizationCalendar` (`today()`, `thisMonth()`, `now()`, `todayEndsAt()`,
    `zone()`, `locale()`, from the app's `Clock` in the organization's zone), `OrganizationContext`,
    and `GET /api/organization`. The shell writes the context into the page (`#app-context`).
  - `roux-roles`: `RouxRoles.OWNER`, created by its changelog with who-admin's permissions; the first
    owner; `UserInvitations` (invite by name, with the app's own writes in the invitation's
    transaction, and `resend(identityId)`); invitable roles and `GET /api/roles/invitable`;
    `CallerPermissions` (`has`, `require`) for the parts of a response only some callers see;
    `Permissions.allOf`; and for an app's roles test, `RoleGrantsCheck` and `PermissionsTypeScript`
    (writes and checks the frontend's `permissions.gen.ts`). roux publishes `UserJoined`, with the
    user's role, for the first owner and every invited user.
  - `roux-users`: each user's display name (`AppUser`, table `roux_user`), the read-only directory
    (`UserDirectory`, `UserFilter`, `UserSort`), and `/api/users` (`GET`/`PUT /me`, list, detail,
    history, invite, resend an invitation, rename, change role, deactivate, reactivate, sign out
    everywhere, make an existing user an owner after a recent sign-in), behind `users.read`,
    `users.invite`, `users.manage` and `users.owners` (`RouxUserPermissions`), granted to `OWNER`.
    Each change is an activity, and the activity log names actors after their `AppUser`.
  - `roux-activity-log`: a record's business history. A kind is a record implementing
    `BusinessActivity`; `ActivityLog.append(anchor, activity, related...)` stores it in the change's
    transaction with the actor and time (table `roux_activity`), `ActivityLog.history(id, page)` reads
    it, and an `ActorNames` bean names actors. See `docs/guides/activity-log.md`.
  - `roux-money`: `Money(minorUnits, currency)`, an `@Embeddable` record (`times`, `plus`,
    `isPositive`, `format(Locale)`) sent as `{ "minorUnits": 15000, "currency": "USD" }`;
    `@InCurrency`, `@PositiveMoney` and `@PositiveOrZeroMoney`; with `roux.money.currency` set, the
    `MoneySettings` bean and the currency in the organization's context. See `docs/guides/money.md`.
  - `roux-email`: who's five emails (sign-in, invitation, address confirmation, address changed,
    passkey added) finished: named after the app, as plain text and as one HTML card in the brand
    colour. An app replaces one email, or one subject, with its own (`docs/guides/email.md`).
  - `roux-theme` (not in the starter: add it beside the starter, as a new app does): the owner's theme
    in roux's table `roux_theme`. `GET /api/theme` (open, for the signed-out shell) and
    `PUT /api/theme` (`theme.manage`, granted to `OWNER`; a stale `version` is a 409). Each part the
    owner has not chosen is its `roux.theme.*` property.
  - `roux-test` (add it with test scope): the Java test kit. `@AppTest` (the whole app on PostgreSQL,
    a database per context), `TestUsers` (`reset()` empties every table that was empty at startup;
    `signedIn(name, email, role)`, `owner()`, `anonymous()`), `TestUser`, `TestClock`, `TestDatabase`,
    `RecordingWhoEmailSender` and `TestMail`. Servers from `ROUX_TEST_DATABASE_*` and
    `ROUX_TEST_MAIL_*`. See `docs/guides/testing.md`.
- roux-web:
  - `/session`: `SessionProvider` and `useSession()` (the caller, their `Profile`, `refresh`,
    `refreshProfile`, `signOut`, `currentMe`; the query cache emptied when the person changes) and
    the route guards `requireSignedIn`, `requireSignedOut` and `requirePermission`.
  - `/signin`: `EmailSignIn` (a link, or the code from the email), `PasskeySignInButton`,
    `ProviderSignInButtons` / `ProviderSignInButton` (drawn as each provider's guidance asks),
    `EmailLinkLanding`, `useSignInReturn` with `rememberSignInReturn`, and `PasskeySettings` (the
    person's passkeys, with `passkeyLabelError` and `PASSKEY_LABEL_MAX`).
  - `/navigation`: `defineNav(permissions, items)`, typed against the router's routes and the app's
    permissions (and checked when the module loads), `navItemsFor`, `startPathFor`,
    `openingRedirect`, `AppShell` and `NavLinks`.
  - `/theme`: `ThemeProvider` (Chakra with the page's theme, the bundled font and the CSP nonce),
    `useShellTheme`, `createThemeSystem` and `<AppearanceSettings />` (the owner's form, with live
    preview and Undo).
  - `/organization` (`loadOrganization`, `today`, `useToday`, `startDayWatch`, `setOrganization`,
    `testOrganization`, ...) and `/dates` (`formatDate`, `formatTime`, `formatDateTime`,
    `formatNumber`, `formatInstantDate`, `formatRelativeTime` in the organization's locale and zone;
    `parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime`).
  - `/money` (`Money`, `formatMoney`, `timesMoney`, `currencySymbol`, `digitsOf`,
    `organizationCurrency`), and in `/form` the `money()` rule, `f.MoneyField` and `moneyInputOf`:
    amounts are parsed without floating point, held to the server's rules by `contracts/money.json`.
  - `/activity`: `Activity`, `ActivityList`, `historyQuery`.
  - `/testing`: the browser test kit (`server`, `listen`, `checkAllAnswered`, `settle`,
    `testQueryClient`, `renderWithProviders`, `renderHookWithProviders`, the problem answers
    `invalidFields`, `invariantViolation`, `notFound`, `stale`, `serverError`, and `pageOf`), with
    `/testing/setup` for the app's setup file.
  - `/api`: `optimisticMutation(key, options)`, `useOptimisticValue` and `useOptimisticToggle`, for a
    control that saves on change and shows it at once; a refusal toasts and falls back.
  - `/form`: `id()` (a required select over ids loaded at run time), `oneOf(values).optional()` and
    `id().optional()` (`ChoiceRule`), `after(schema, { field, other, otherLabel })` (the same words as
    `@After`, `contracts/after.json`), and `time()` with `timeInputOf` (`HH:mm` or `HH:mm:ss`,
    `contracts/time.json`).
  - `/paging`: `idSearchOf` and `dateSearchOf`, beside `enumSearchOf`.
  - `PageHeader` (a page's title and actions), and `FilterChips`' `defaultValue` (the chip shown
    chosen while the URL has none).

### Changed

- roux-problems answers a JSON body's enum value outside its set (`"role": "OWNER"`) as a field error
  on that field, `Must be one of MEMBER, INSTRUCTOR` (`items[1].role` inside a list), and a date, time
  or instant it cannot read as `Is not in the expected format`. Both were the generic 400.
- `phone()` is one pattern, `^(?=(?:\D*\d){7})[\d +\-().]+$`: only spaces (not tabs or other
  whitespace) between digits, as its description always said.

### Fixed

- roux-web's `DebouncedSearchInput` reports its pending term when the field loses focus, and at once
  when cleared, so a link clicked within the debounce no longer loses to the late search.

### Requirements

- Spring Boot 4.1.3 (was 4.1.2), who 0.26.0 (was 0.15.0), migratory 0.1.0, jpa-utils 0.2.0.

## [0.2.0] - 2026-11-14

Forms that are easy to write: Zod schemas with the server's wording, mutations declared once per
endpoint, and `useSchemaForm` doing the rest.

### Breaking changes

- `showProblem` and `showServerErrors` are removed, and with them the `fieldNames` mapping. Use
  `useSchemaForm`, which places a 400's field errors and toasts the rest.
- `useServerAction` takes a mutation: `useServerAction(mutation, { failure?, onSuccess? })`. The
  `request` and `refreshes` options are gone; declare `meta.refreshes` on the mutation.
- `textOrNull`, `numberOrNull` and `instantOrNull` are removed. The schema's parse trims text, turns
  `""` into `null` and coerces numbers and dates; `inputOf`, `numberInputOf` and `dateTimeInputOf` stay.
- `FormDialog`'s `open`, `onOpenChange` and `submitLabel` are optional. It now opens, closes (after a
  save) and resets itself; drop the state you kept for it, or keep passing both props to stay
  controlled. `submitLabel` defaults to "Save".
- `notify.problem(problem, title)` keeps `title` as the toast's title and puts the detail (and
  `Reference: <id>`) underneath. Before, the detail replaced the title.
- `ResetButton` is disabled while the form is clean.
- Zod (`^4.6.7`) is a peer dependency of `@jwcarman/roux-web`: `npm install zod`. `/form` calls
  `z.config({ jitless: true })` when it loads.

### Added

- `/form`: rule helpers `text`, `email`, `url`, `phone`, `date`, `number`, `integer`, `oneOf` and
  `fieldRules`, with the server's validation messages.
- `useSchemaForm`: validates with a Zod schema, submits the parsed output through a mutation, and
  handles refusals. A save always carries the mutation (so the version) its draft started from, even
  when a refetch brought a newer record meanwhile, so it cannot quietly undo whoever saved first: the
  server answers 409. A 409 starts the form over from the caller's record when it differs from the
  one the draft started from; a 409 that changes nothing the form shows (a duplicate on create, or a
  change to a field it does not show) keeps what was typed, and the next save goes at the latest version.
- Fields take `required` and `maxLength` from the schema; `SelectField` takes typed options (values
  with `labels`, or `{ value, label }` with number or boolean values).
- `/api`: `sendJson` (an answer without a body, such as a 204 or a 201 with only a `Location`,
  resolves `undefined`), `{ params, signal }` on `get` and `getJson` (`params` takes any object,
  an interface such as `PageParams` too), `PATCH`, the `path` tagged template, and `baseUrl` in
  `configureApi` (default `/api`; a path without a leading slash goes under it).
- `/api`: `createQueryClient`, which refetches a mutation's `meta.refreshes` after every answer;
  `shouldRetry`; `useClearQueriesOnIdentityChange`.
- Moved into roux: `SearchInput` and `DebouncedSearchInput` (`/table`), `InfiniteList` and
  `InfiniteSelect` (`/paging`), `NotFoundPage`, `ErrorPage` and `removal` (`/feedback`).
- `roux-problems`: the `Must be a valid web address` message for `@URL`.

## [0.1.0] - 2026-11-14

First release: the contracts every roux application shares, on both the Java and web sides.

### Added

- `roux-problems`: every error a Spring MVC API raises is answered as an RFC 9457 Problem Detail.
  Includes `NotFoundException`, `InvariantViolationException`, `InvalidFieldException` and
  `ConflictException` (409), field-level problems from Bean Validation, and handlers for Spring
  Security, who and paging errors. Validation messages ship as `ContributorValidationMessages`, so an
  application's own `ValidationMessages` does not hide them. Native-image runtime hints included.
- `roux-autoconfigure` and `roux-spring-boot-starter`: Spring Boot auto-configuration, with settings
  `roux.problems.enabled` and `roux.problems.api-path-prefix` (default `/api/`).
- `roux-bom`: aligns the roux modules and curates who 0.15.0 and jpa-utils 0.2.0. It does not import
  Spring Boot's BOM.
- `@jwcarman/roux-web` on npm, with subpaths `problem`, `api`, `paging`, `table`, `feedback` and
  `form` (Zod validation).
- Frozen JSON contract fixtures in `contracts/`, tested by both the Java and web sides.

### Requirements

- Java 25 and Spring Boot 4.1.
- React, Chakra UI and the TanStack libraries are peer dependencies of `@jwcarman/roux-web`.

[Unreleased]: https://github.com/jwcarman/roux/compare/0.3.0...HEAD
[0.3.0]: https://github.com/jwcarman/roux/releases/tag/0.3.0
[0.2.0]: https://github.com/jwcarman/roux/releases/tag/0.2.0
[0.1.0]: https://github.com/jwcarman/roux/releases/tag/0.1.0
