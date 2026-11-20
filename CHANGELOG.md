# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- Money reads the organization's context (roux-money is unreleased, so this changes the unreleased
  API): `money()`, `f.MoneyField` and `moneyInputOf(money)` take no settings; `formatMoney(money)` takes
  no locale and uses the server's digits; `moneySettingsQuery`, roux-web's `MoneySettings` and
  `GET /api/money` (`MoneyController`) are gone. A money schema is a module constant.
- `@NotInFuture` checks against the organization's today (`OrganizationCalendar.today()`), exactly; the
  one-day allowance remains only outside a roux app. `date().notInFuture()` compares with `today()`.
- Roles and permissions (`docs/guides/roles.md`). What changes for a roux app:
  - Set `roux.owner.email` and `roux.owner.name` (both required; startup fails naming the missing one). While
    no active identity holds `OWNER`, roux creates one at startup and publishes `UserJoined` in its
    transaction. Delete the app's own owner bootstrap; an app that keeps its own data per user listens for
    `UserJoined` (it carries the user's role), which roux also publishes for every user invited through `UserInvitations`
    (invite by name, with the app's own work in the invitation's transaction).
  - Set `roux.roles.invitable` to the roles an invitation may give (empty by default, so every invitation is
    refused until it is set; `OWNER` may not be listed). roux refuses any other role inside the invitation's
    transaction, and serves the list at `GET /api/roles/invitable`.
  - The app's roles move to a Liquibase changeset that creates them and grants their permissions by name
    (`ON CONFLICT DO NOTHING`), and grants `OWNER` the app's own permissions. Remove startup code that
    creates or syncs roles.
  - roux-theme's `ThemeController.MANAGE` is `RouxThemePermissions.THEME_MANAGE`; roux-theme's changelog
    grants `theme.manage` to `OWNER` (changeset `roux-theme-2`).
  - The starter brings who-admin. Deactivating someone or removing a role in the app's own service goes
    through who-admin's `LastAdminGuard`, which refuses to leave no active identity that may manage people
    (only `OWNER` does, by default). roux answers `LastAdminException` as a `409` problem with code
    `last-admin`.
- Spring Boot 4.1.3 (was 4.1.2), the version migratory 0.1.0 is built against.
- who 0.26.0 (was 0.24.0; 0.26.0 adds resending an invitation), `@jwcarman/who-client` 0.25.0, and libraries' tables through
  [migratory](https://github.com/jwcarman/migratory) 0.1.0, which who brings. What changes for a roux app:
  - Remove the includes of who's changelog (`classpath:org/jwcarman/who/db/who-changelog.xml`, gone in who
    0.25.0) and roux-theme's (`classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml`) from the master
    changelog, and the `who.initialize-schema` setting. Each library declares its changelog in
    `META-INF/migratory.properties` (roux-theme: `name=roux-theme`, `after=who-jdbc`); migratory runs them in
    order before the app's changelog. Paths are unchanged, so an existing database runs nothing again.
  - `spring.liquibase.enabled=false` turns off only the app's changelog; `spring.liquibase.drop-first` fails
    startup (`migratory.drop-first=true` rebuilds a development database instead); `migratory.enabled=false` turns off the libraries' runs (the app then includes their changelogs). A
    test profile that used `spring.liquibase.enabled=false` to keep Liquibase off the database also sets
    `migratory.enabled=false`.
  - who's `WhoEmailTemplates` is `WhoEmailTemplatesContributor`.
- who 0.24.0 (was 0.22.0; 0.23.0 then 0.24.0), and `@jwcarman/who-client` 0.24.0. What changes for a roux app:
  - The starter brings `who-email` (it renders who's emails). SMTP delivery stays the app's choice, as
    `spring-boot-starter-mail` did: add `who-email-smtp` beside it (the dojo and the getting-started
    guide's pom do), or write a `WhoEmailSender`, which now only delivers a rendered `OutgoingEmail`
    (`to`, `subject`, `text`, `html` or null, `source`); `MailWhoEmailSender` is `SmtpWhoEmailSender`.
  - `who.email.from` replaces `who.email-link.from` and `who.passkey.from`; subjects are message keys
    (`who.email.<template>.subject`); the passkey-added email goes out whenever email-link sign-in is on.
  - Under `/who`, who answers every error itself as Problem Details (`type` `urn:who:error:<code>`, `title`,
    `status`, `detail`, `code`), whatever the app's advice says; `invalid-request` replaces
    `invalid-admin-request`, `invalid-api-key-request` and `invalid-invitation`. `WhoProblemsAdvice` now
    answers only who's exceptions on the app's own endpoints (sign-in failed, reauthentication required),
    in who's shape (`type`, `code`); the passkey-registration handler is gone, as that error is only
    raised under `/who`.
  - who's `/who/me` and admin endpoints are Spring MVC controllers: the app's `authorizeHttpRequests`
    rules apply to them (never deny `/who/**`), and an app controller on their paths, a path prefix or
    `spring.mvc.servlet.path` that moves them fails startup.
  - A passkey label is 1 to 64 characters, not blank, with no control characters; the dojo's passkey
    form checks it before the browser creates the passkey.
- who 0.22.0 (was 0.21.0): `InvitationService.invite(email, roleNames, callback)` runs the app's
  own writes in the invitation's transaction. The dojo's invite form uses it for the member's
  profile and activity entry.

### Added

- roux-users (in the starter): users on the server. `AppUser` (each user's display name, in roux's
  table `roux_user`, made by roux's `UserJoined` listener), the read-only directory
  (`roux_user_directory`, `UserDirectory`, `UserFilter`, `UserSort`), and the users endpoints under
  `/api/users` (`GET`/`PUT /me`, list, detail, history, invite, resend an invitation, rename, change
  role, deactivate, reactivate, sign out everywhere, and make an existing user an owner with a
  recent sign-in), behind `users.read`, `users.invite`, `users.manage` and `users.owners`
  (`RouxUserPermissions`), which roux-users' changelog grants to `OWNER`. Each change
  is an activity (`user.invited`, `user.renamed`, `user.deactivated`, `user.reactivated`,
  `user.role_changed`), and the activity log names actors after their `AppUser`
  (`AppUserActorNames`). What changes for a roux app: delete its own profile table, directory,
  invite endpoint and actor names, move each profile's name into `roux_user` in a changeset, grant
  `users.*` to its roles, and list `RouxUserPermissions` in its roles test. See
  `docs/guides/users.md`.
- roux-roles: `UserInvitations.resend(identityId)`, through who 0.26's `InvitationService.resend`.
- roux-jpa: `IdentityAuditor`, registered for you, records the signed-in identity's id (or
  `"system"`, or the name set in `roux.auditing.system-auditor`) in `@CreatedBy` and
  `@LastModifiedBy`. An app writes a plain `@EnableJpaAuditing`, with no `auditorAwareRef` and no
  auditor of its own; one it defines (any `AuditorAware` bean) is kept.
- `roux-test` (in the BOM, not the starter; add it with test scope): the Java test kit an app copied
  before. `@AppTest` (the whole app on PostgreSQL, a database per context), `TestUsers` (`reset`,
  `signedIn(name, email, role)`, `owner()`, `anonymous()`), `TestUser`, `TestClock`, `TestDatabase`,
  `RecordingWhoEmailSender` and `TestMail`. A test person joins as a real user does: who's identity,
  address and role, and `UserJoined`, in one transaction. The database and mail servers named by the
  environment are `ROUX_TEST_DATABASE_*` and `ROUX_TEST_MAIL_*`. See `docs/guides/testing.md`.
- `@jwcarman/roux-web/testing`: the browser test kit. The fake network (`server`, `listen`,
  `checkAllAnswered`, `settle`), `testQueryClient`, `renderWithProviders`, `renderHookWithProviders`
  (roux's query client and theme), the server's problem answers (`invalidFields`, `invariantViolation`,
  `notFound`, `stale`, `serverError`) and `pageOf`; and `@jwcarman/roux-web/testing/setup`, which the
  app's own setup file imports. `msw`, `@testing-library/react`, `@testing-library/jest-dom` and
  `vitest` are optional peer dependencies.
- `roux-activity-log`, in the starter: the business activity log. A kind is a record implementing
  `BusinessActivity` (`type()`, `describe()`); `ActivityLog.append(anchor, activity, related...)` stores it
  in the change's transaction with the actor, the time and its components as JSON, in roux's table
  `roux_activity`; `ActivityLog.history(id, page)` reads a record's history; an `ActorNames` bean names
  actors. roux-web: `@jwcarman/roux-web/activity` (`Activity`, `ActivityList`, `historyQuery`) and `formatRelativeTime` in
  `./dates`. See `docs/guides/activity-log.md`.
- `CallerPermissions` (roux-roles): `has(permission)` and `require(permission, what)` for the parts of a
  response only some callers see (a list's column, its filter and sort). See `docs/guides/roles.md`.
- `roux-organization`, in the starter: `OrganizationCalendar` (`today()`, `thisMonth()`, `now()`,
  `todayEndsAt()`, `zone()`, `locale()`, from the app's `Clock` in the organization's zone),
  `OrganizationContext`, `OrganizationContextSource` and `GET /api/organization`
  (`OrganizationController`); the settings are `RouxOrganizationProperties`. The shell writes the context
  into the page (`#app-context`).
- roux-web: `@jwcarman/roux-web/organization` (`loadOrganization`, `readPageOrganization`,
  `fetchOrganization`, `today`, `useToday`, `startDayWatch`, `organization`, `setOrganization`,
  `testOrganization`, ...), and in `/dates` the formatters `formatDate`, `formatTime`, `formatDateTime`
  and `formatNumber`, in the organization's locale and zone.
- `roux-money`, in the starter: `Money(minorUnits, currency)`, an `@Embeddable` record (`times`, `plus`,
  `isPositive`, `format(Locale)`), sent as `{ "minorUnits": 15000, "currency": "USD" }`; the constraints
  `@InCurrency`, `@PositiveMoney` and `@PositiveOrZeroMoney`; and, with `roux.money.currency` set, the
  `MoneySettings` bean. See `docs/guides/money.md`.
- roux-web money: `@jwcarman/roux-web/money` (`Money`, `formatMoney`, `timesMoney`, `currencySymbol`,
  `digitsOf`, `organizationCurrency`), and in `/form` the `money()` rule, `f.MoneyField` and
  `moneyInputOf`. Typed amounts are parsed without floating point; `contracts/money.json` keeps the
  browser's parsing and the server's rules the same.

- `roux-roles`, in the starter: `RouxRoles.OWNER`, created by its changelog with who-admin's permissions;
  the first owner (`OwnerBootstrap`, `UserJoined`), invitations by name (`UserInvitations`); invitable roles (`InvitableRoles`, its guard and
  `GET /api/roles/invitable`); `Permissions.allOf`; and, for an app's roles test, `RoleGrantsCheck` (the
  grants match the constants) and `PermissionsTypeScript` (writes and checks the frontend's
  `permissions.gen.ts`).
- `roux-email`, in the starter: who's five emails (sign-in, invitation, address-confirmation, address-changed,
  passkey-added) finished. Each names the app in its subject and bodies, in who's wording, as plain text and as
  one HTML card (tables and inline styles, no images or web fonts) with the action in the brand colour.
  `RouxEmailModelContributor` gives every email `extra.roux.appName`, `extra.roux.brandColor` (`#rrggbb`; the
  brand colour, or a fixed colour per Chakra palette) and `extra.roux.buttonText` (white or near-black, by WCAG
  contrast), read from the shell's theme at each send. An app replaces one email, or one subject, with its own
  file or message (`docs/guides/email.md`). Needs who 0.24.0 (library templates, subjects with values).
- `@jwcarman/roux-web/navigation`: the navigation, typed. `defineNav(permissions, items)` takes entries whose
  `to` is a route the router knows (a misspelt route is a type error), `icon` a component (not a name looked up
  in a hand-kept map) and `permission` one of the app's declared permissions: TypeScript checks it, and
  `defineNav` throws when the module loads for a typo that gets past it, a duplicate place or label, two start
  places, or a Home item beside a start place elsewhere. `navItemsFor`, `startPathFor` and `openingRedirect`
  work from the session's permissions. `AppShell` (sidebar, icon rail and drawer, with the app's own account
  area) and `NavLinks` moved from the dojo. New peer dependency: `@tanstack/react-router`.
- `@jwcarman/roux-web/signin`: the sign-in pieces, ported from who's example app into Chakra. `EmailSignIn`
  (email me a link, then "open the link, or type the code from the email" with `autoComplete="one-time-code"`,
  who's refusal under the field), `PasskeySignInButton`, `ProviderSignInButtons` / `ProviderSignInButton`
  (a link to who's authorize URL, "Continue with <name>", drawn as each provider's published guidance asks:
  Google's four-color G on white with its outline and its dark variant, Microsoft's four squares, Apple, GitHub,
  GitLab, Okta; any other provider gets a generic icon and who's display name; `icon` and `label` override),
  `EmailLinkLanding` (the `/signin/link` page), and `useSignInReturn` with `rememberSignInReturn` (the page
  the visitor asked for, moved from the dojo). A sign-in ends in a full page load. New peer dependency:
  `@jwcarman/who-client`.
- `@jwcarman/roux-web/theme`: `ThemeProvider` (Chakra's provider with the page's theme, the bundled font, and
  Emotion's cache under the page's CSP nonce, so an app cannot forget the nonce), `useShellTheme`,
  `createThemeSystem` (a Chakra system for a `ShellTheme`) and `<AppearanceSettings />` (the owner's form with
  live preview, Undo and conflict handling, saving through roux-theme's `/api/theme`). Moved from the dojo.
  A page theme the app has no look for throws at startup instead of falling back. New peer dependencies:
  `culori`, `@emotion/cache` and the three `@fontsource-variable` fonts (`inter`, `lora`, `nunito`).
- `roux-theme`, the owner's theme in roux's own table (`roux_theme`, from the changelog the jar ships:
  `classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml`, run by migratory before the app's changelog).
  `GET /api/theme` (open to anyone: the shell needs it signed out), `PUT /api/theme` (`theme.manage`, with the
  `version` read; a stale one is a 409), values validated against the shell's own sets, and the
  `ShellThemeSource` bean that makes the shell show it. Each part the owner has not chosen is the `roux.theme.*`
  property. It is not in the starter: an app adds it beside the starter (a new app does; a fixed-brand app leaves it out and sets `roux.theme.*`), and roux-autoconfigure switches it on (`RouxThemeAutoConfiguration`,
  `RouxThemePersistenceAutoConfiguration`).
- roux serves the app's shell. `roux-spa` answers the page request with `index.html` carrying the request's
  nonce, the theme and the app's name, `Cache-Control: no-store` and a strict Content-Security-Policy
  (`ContentSecurityPolicy`), extended only by explicit per-directive `roux.spa.csp.*` properties that append to
  the defaults (a wildcard or an unsafe keyword stops the app from starting). The theme comes from the
  `ShellThemeSource` seam: an app's own bean, or the `roux.theme.*` properties (Chakra's stock look and
  `spring.application.name`), which a value the frontend has no look for refuses at startup. An `index.html`
  without the three placeholders does not start. An app deletes its `ShellController` and header writer.
- An insert that may already have been done stays transactional. roux-jpa's `Idempotent.insert(entityManager, key,
  exists, insert)` takes a transaction-scoped PostgreSQL advisory lock on the key, then checks and inserts, so a
  race never meets the unique constraint (a violation would mark the transaction rollback-only). Proven
  against PostgreSQL in the contract tests; the errors guide says why a lock and not `ON CONFLICT DO NOTHING`.
- A control that saves on change shows the change at once. `optimisticMutation(key, options)`, `useOptimisticValue`
  and `useOptimisticToggle` in `@jwcarman/roux-web/api`: the key becomes the mutation's key and scope (saves
  queue in order, the hook finds the pending value), a plain `mutationOptions` is a type error, a double tap
  asks `true` then `false`, and a refusal toasts and falls back to the server's value.
- `dateSearchOf(raw)` in `@jwcarman/roux-web/paging`, beside `enumSearchOf` and `idSearchOf`: a URL's date is a real
  `YYYY-MM-DD` or absent.
- An optional choice. `oneOf(values).optional()` and `id().optional()` (roux-web): a select at its
  placeholder is `""` in the form and `null` once parsed. New type `ChoiceRule`.
- A rule across two fields. roux-validation's class-level `@After(field, other, otherLabel)` (a field error
  on the later field, `Must be after {other}`; `LocalTime`, `LocalDate`, `Instant`, numbers, any
  `Comparable`) and roux-web's `after(schema, { field, other, otherLabel })` say the same words, with
  `contracts/after.json` and a contract test on each side.
- A time of day. roux-web's `time()` rule (`Must not be empty`, `Is not in the expected format`; `HH:mm`
  or the `HH:mm:ss` Jackson writes) and `timeInputOf` mirror a `@NotNull LocalTime`, with
  `contracts/time.json` and a contract test on each side. A date, time or instant in a JSON body
  that the server cannot read is now a field error, `Is not in the expected format`, in roux-problems
  (it was a generic 400).
- roux-web's date library is date-fns, a new peer dependency (`^4.4.0`; `npm install date-fns`). The
  new `@jwcarman/roux-web/dates` subpath has `parseIsoDate`, `formatIsoDate`, `parseIsoTime` and
  `formatIsoTime`, which go between the wire's ISO strings (`2026-11-17`, `18:30`) and date-fns Dates,
  strictly; `date().notInFuture()` uses them.
- roux-spa serves a single-page app's shell for any page URL, so a route is written once,
  in the frontend. With `static/index.html` on the classpath, a GET or HEAD that accepts `text/html`,
  has no file extension and is not under `/api`, `/who`, `/assets`, `/actuator`, `/.well-known` or
  `/error` (or a path in `roux.spa.excluded-paths`) is presented to the app as a request for
  `/index.html`, ahead of Spring Security, so the app's own shell handler and headers still apply.
  `/assets/**` is cached for a year, and with who on the classpath `/index.html` and `/assets/**`
  are added to who's public paths, so no page is listed in `who.security.public-paths`. Switched on
  by the roux-spa jar (auto-configured from roux-autoconfigure); removing the jar turns it off.

### Breaking changes

- The organization's time zone and locale (`docs/guides/dates-and-time.md`). What changes for a roux app:
  - Set `roux.organization.time-zone` (an IANA zone, `America/New_York`) and `roux.organization.locale`
    (a BCP 47 tag, `en-US`). Both are required; startup fails naming a missing or unknown one, a fixed
    offset (`+05:00`, `UTC+3`) for the zone, or a tag written another way (`en-us`).
  - Add `<script type="application/json" id="app-context">__APP_CONTEXT__</script>` to `index.html`,
    after `#app-theme`. A built page without it fails startup (`ShellPage`).
  - In `main.tsx`, `await loadOrganization()` and `startDayWatch(queryClient)` before `render`; in the
    Vitest setup, `beforeEach(() => setOrganization(testOrganization()))`.
- roux's features are in their own modules, switched on by their jars (every auto-configuration
  stays in roux-autoconfigure, with optional dependencies on the modules). The starter and roux-bom
  carry all of them, so an app on the starter needs only the new imports.
  - New `roux-validation` (`org.jwcarman.roux.validation`): `@Phone` and `@NotInFuture`, moved from
    `org.jwcarman.roux.problems.constraints`, and every roux validation message
    (`ContributorValidationMessages.properties`, which roux-problems no longer has). The message
    keys for the two constraints follow the packages.
  - New `roux-spa` (`org.jwcarman.roux.spa`): `SpaFallbackFilter`, moved from
    `org.jwcarman.roux.autoconfigure.spa`. The `roux.spa.enabled` property is gone: removing the
    jar is the off switch. `roux.spa.excluded-paths` stays.
  - New `roux-jpa` (`org.jwcarman.roux.jpa`): `Versions`, moved from `org.jwcarman.roux.problems`.
    roux-problems drops spring-orm; `RouxAuditingAutoConfiguration` now needs roux-jpa on the class
    path, and `ClockDateTimeProvider` is there.
- who 0.21.0 (was 0.20.0), in the parent POM and roux-bom. who's endpoints are REST-shaped: the
  person's own things moved under `/who/me` (`/who/me/sessions`, `/who/me/passkeys` for listing and
  registering, `/who/me/email-addresses`, `/who/me/accounts`, `/who/me/api-keys`; a passkey is
  registered with `POST /who/me/passkeys/options` then `POST /who/me/passkeys`), with no aliases.
  `EmailLinkSender` is `WhoEmailSender` and invitations are a new `InvitationMessage` kind, so a
  sender needs an exhaustive `switch` with no `default`. `@jwcarman/who-client` 0.21.0 moves the
  account calls to `client.me.*`. See who's changelog for the full list.
- roux-autoconfigure no longer defines a `WhoPublicPaths` bean. It contributes `/index.html` and
  `/assets/**` with a `WhoPublicPathContributor` bean, so an app's `who.security.public-paths` and
  any other contributor apply with them (an app that replaced `WhoPublicPaths` before drops every
  contribution; contribute with a bean instead).
- roux-web's list components take the resource module's query, not a key plus a fetch function.
  `QueryTable` and `useQueryTable` take `query: PageQuery<T>` (replacing `queryKey` and `query`),
  `InfiniteList` takes `query: PageQuery<T>` (replacing `queryKey` and `fetchPage`), `InfiniteSelect`
  takes `query: PageQuery<T>` (replacing `queryKey` and `queryFn`; `InfiniteSelectQuery` is gone, its
  parameters are `PageParams`), and `SimpleQueryTable` takes `query` as the list's TanStack query
  options (replacing `queryKey` and `query`; pass the module's `queryOptions(...)`). Every page
  fetch now receives the `AbortSignal`, so a page no longer needed is cancelled.
- `pageQuery` now builds a paged list's query: `pageQuery(queryKey, (params, signal) => ...)`
  returns a `PageQuery<T>` (also new, with `queryKey` and `fetch`). The old `pageQuery(params)`, a URL
  query string for an export link, is renamed `queryStringOf(params)`.

### Fixed

- roux-web's `DebouncedSearchInput` reports its pending term when the field loses focus, not only
  after the debounce. A link clicked within the debounce no longer loses to the late search
  navigating back to the list. Clearing the field (the clear button or Escape) reports at once too.

### Changed

- `NotFoundException` takes a format pattern and its arguments, as `ConflictException`,
  `InvariantViolationException` and `InvalidFieldException` do:
  `new NotFoundException("No student %s", id)`. A call with a plain message compiles and reads as
  before; code compiled against 0.2.0 must be recompiled.
- `roux-spring-boot-starter` brings who (`who-spring-boot-starter`): every roux app uses who for
  identity. Drop your own who starter dependency, or keep it without a version.
- The starter also brings who's two sign-in methods, `who-email-link` (email links and typed codes)
  and `who-passkey`. Each fails startup without its required settings
  (`who.email-link.link-base-url`, `who.email-link.code-secret`, a way to send email, and
  `who.passkey.rp-id`); see who's configuration guide.
- who is upgraded from 0.15.0 to 0.20.0. Its endpoints move under `/who` (for example
  `/ott/generate` is now `/who/email/send` and `/logout` is `/who/logout`; `/who/me` is
  unchanged), it adds a `who_session` table, and an app with no `SecurityFilterChain` of its own
  gets who's chain. Read who's
  [upgrading guide](https://github.com/jwcarman/who/blob/0.20.0/docs/guides/upgrading.md) for
  0.16.0 through 0.20.0.
- roux-problems answers an enum value in a JSON body that is outside its set (`"role": "OWNER"`) as a field error on that field, `Must be one of MEMBER, INSTRUCTOR` (`items[1].role` inside a list), as it already did for a query parameter. It was the generic 400 with no field. Other unreadable bodies are unchanged.
- `phone()` is now one pattern, `^(?=(?:\D*\d){7})[\d +\-().]+$`: only spaces (not tabs or other whitespace) are allowed between digits, as its description always said.


### Added

- `idSearchOf(raw)` in `@jwcarman/roux-web/paging`, beside `enumSearchOf`, for a URL filter whose values are ids loaded at run time: it keeps a UUID-shaped string and drops anything else to `undefined`.
- `FilterChips` takes `defaultValue`: the chip shown chosen while the URL has no value, reported as `undefined` when chosen, so the default stays out of the URL. It excludes `allLabel` (a type error to pass both).
- `id()` in `@jwcarman/roux-web/form`: a required select over ids loaded at run time (`""` for the placeholder), with the server's `Must not be empty`, replacing `z.string().min(1, ...).register(fieldRules, ...)` with the message retyped.
- roux-validation: `@NotInFuture` for a `LocalDate` a person picks in a browser (`Must not be in the future`). It compares with today by the application's `Clock` bean (the system clock without one) and allows one day past the server's today, because a browser up to UTC+14 is ahead of the server's zone and `@PastOrPresent` refused its valid "today". Spring Boot's validation builds it, so apps only annotate. roux-web: `date().notInFuture()` says the same words, comparing with the browser's own today.
- roux-validation: `@Phone`, the browser's `phone()` rule as a Bean Validation constraint with the same pattern (`Phone.PATTERN`) and message (`Is not in the expected format`; a blank value is left to `@NotBlank`). `contracts/phone.json` holds both sides to one pattern and to the same accepted and refused examples (`PhoneContractTest`, `rules.contract.test.ts`).
- roux-jpa: `Versions.require(entity, request.version())`, the stale-version check every edit makes: no version is an `InvalidFieldException` on `version` (`Must not be empty`), a version that is not the entity's current one is the `ObjectOptimisticLockingFailureException` answered as the 409. It replaces the copy each service wrote. roux-jpa has `spring-orm` and jpa-utils.
- roux-jpa: JPA auditing stamps `@CreatedDate` and `@LastModifiedDate` from the application's `Clock` bean. With `@EnableJpaAuditing(auditorAwareRef = ...)` and a `Clock` bean, roux-jpa's `ClockDateTimeProvider` over the clock is registered (Spring Data's auditing handler takes it by type), so an app needs no `DateTimeProvider` bean or `dateTimeProviderRef` of its own. With no `Clock` bean, or a `DateTimeProvider` of the app's own, nothing changes.

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

[Unreleased]: https://github.com/jwcarman/roux/compare/0.2.0...HEAD
[0.2.0]: https://github.com/jwcarman/roux/releases/tag/0.2.0
[0.1.0]: https://github.com/jwcarman/roux/releases/tag/0.1.0
