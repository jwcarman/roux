# @jwcarman/roux-web

The web half of [roux](https://github.com/jwcarman/roux): the React plumbing a roux application needs, written
once. It is ESM-only and has one subpath per concern.

## Subpaths

- `@jwcarman/roux-web/problem`: types and helpers for RFC 9457 Problem Details.
- `@jwcarman/roux-web/api`: the fetch client (`getJson`, `sendJson`, `path`, `baseUrl`), `createQueryClient` (mutations' `meta.refreshes`), and `useServerAction`.
- `@jwcarman/roux-web/paging`: paging types, `InfiniteList` and `InfiniteSelect`.
- `@jwcarman/roux-web/table`: a TanStack Table wrapper driven by a query, and `SearchInput`.
- `@jwcarman/roux-web/feedback`: toasts, confirmation dialogs, error messages, `NotFoundPage`, `ErrorPage` and `removal`.
- `@jwcarman/roux-web/form`: Zod rule helpers (`text`, `email`, `oneOf`, ...), `useSchemaForm`, fields and `FormDialog`.

## Peer dependencies

The app supplies `@chakra-ui/react`, `@emotion/react`, `@tanstack/react-form`, `@tanstack/react-query`,
`@tanstack/react-table`, `react`, `react-icons` and `zod` (`^4.6.7`).

`/form` calls `z.config({ jitless: true })` when it loads, so Zod never probes `eval` and a Content-Security-Policy
without `unsafe-eval` stays quiet. `package.json` lists that file in `sideEffects`; a bundler must keep it.

See the [repository README](https://github.com/jwcarman/roux#readme) for the Java modules and a schema, API module,
mutation and form worked through.

Licensed under the Apache License 2.0.
