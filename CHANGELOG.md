# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Changed

- who 0.22.0 (was 0.21.0): `InvitationService.invite(email, roleNames, callback)` runs the app's
  own writes in the invitation's transaction. The dojo's invite form uses it for the member's
  profile and activity entry.

### Added

- `@jwcarman/roux-web/theme`: `ThemeProvider` (Chakra's provider with the page's theme, the bundled font, and
  Emotion's cache under the page's CSP nonce, so an app cannot forget the nonce), `useShellTheme`,
  `createThemeSystem` (a Chakra system for a `ShellTheme`) and `<AppearanceSettings />` (the owner's form with
  live preview, Undo and conflict handling, saving through roux-theme's `/api/theme`). Moved from the dojo.
  A page theme the app has no look for throws at startup instead of falling back. New peer dependencies:
  `culori`, `@emotion/cache` and the three `@fontsource-variable` fonts (`inter`, `lora`, `nunito`).
- `roux-theme`, the owner's theme in roux's own table (`roux_theme`, from the changelog the jar ships:
  `classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml`, which the app includes as it includes who's).
  `GET /api/theme` (open to anyone: the shell needs it signed out), `PUT /api/theme` (`theme.manage`, with the
  `version` read; a stale one is a 409), values validated against the shell's own sets, and the
  `ShellThemeSource` bean that makes the shell show it. Each part the owner has not chosen is the `roux.theme.*`
  property. The starter brings it, and roux-autoconfigure switches it on (`RouxThemeAutoConfiguration`,
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
