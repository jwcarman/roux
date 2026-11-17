# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

### Breaking changes

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

### Added

- `idSearchOf(raw)` in `@jwcarman/roux-web/paging`, beside `enumSearchOf`, for a URL filter whose values are ids loaded at run time: it keeps a UUID-shaped string and drops anything else to `undefined`.
- `FilterChips` takes `defaultValue`: the chip shown chosen while the URL has no value, reported as `undefined` when chosen, so the default stays out of the URL. It excludes `allLabel` (a type error to pass both).
- `id()` in `@jwcarman/roux-web/form`: a required select over ids loaded at run time (`""` for the placeholder), with the server's `Must not be empty`, replacing `z.string().min(1, ...).register(fieldRules, ...)` with the message retyped.

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
