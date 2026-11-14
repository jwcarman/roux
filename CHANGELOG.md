# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

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
  handles refusals. A conflict (409) starts the form over from the refreshed record once the
  mutation's `meta.refreshes` bring a changed one, so the next save cannot quietly undo whoever saved
  first; a 409 that changes nothing (a duplicate on create) keeps what was typed.
- Fields take `required` and `maxLength` from the schema; `SelectField` takes typed options (values
  with `labels`, or `{ value, label }` with number or boolean values).
- `/api`: `sendJson`, `{ params, signal }` on `get` and `getJson`, `PATCH`, the `path` tagged template,
  and `baseUrl` in `configureApi` (default `/api`; a path without a leading slash goes under it).
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

[Unreleased]: https://github.com/jwcarman/roux/compare/0.1.0...HEAD
[0.1.0]: https://github.com/jwcarman/roux/releases/tag/0.1.0
