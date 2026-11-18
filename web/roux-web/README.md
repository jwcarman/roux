# @jwcarman/roux-web

The web half of [roux](https://github.com/jwcarman/roux): the React plumbing a roux application needs, written
once. It is ESM-only and has one subpath per concern; each has a guide.

## Subpaths

- `@jwcarman/roux-web/problem`: the `Problem` type and `problemOf`. [Errors](https://github.com/jwcarman/roux/blob/main/docs/guides/errors.md)
- `@jwcarman/roux-web/api`: the fetch client, `configureApi`, `createQueryClient` and `useServerAction`.
  [API client](https://github.com/jwcarman/roux/blob/main/docs/guides/api-client.md), [Queries and mutations](https://github.com/jwcarman/roux/blob/main/docs/guides/queries-and-mutations.md)
- `@jwcarman/roux-web/paging`: paging types, `InfiniteList`, `InfiniteSelect` and URL helpers.
  [Tables and paging](https://github.com/jwcarman/roux/blob/main/docs/guides/tables-and-paging.md)
- `@jwcarman/roux-web/table`: `QueryTable` and its parts, search inputs and filter chips.
  [Tables and paging](https://github.com/jwcarman/roux/blob/main/docs/guides/tables-and-paging.md)
- `@jwcarman/roux-web/feedback`: toasts, confirmations, error messages, `NotFoundPage` and `ErrorPage`.
  [Feedback](https://github.com/jwcarman/roux/blob/main/docs/guides/feedback.md)
- `@jwcarman/roux-web/form`: Zod rule helpers, `useSchemaForm`, fields and `FormDialog`. [Forms](https://github.com/jwcarman/roux/blob/main/docs/guides/forms.md)

Start with [Getting started](https://github.com/jwcarman/roux/blob/main/docs/guides/getting-started.md); [Testing](https://github.com/jwcarman/roux/blob/main/docs/guides/testing.md) covers Vitest with MSW and
Playwright.

## Peer dependencies

The app supplies `@chakra-ui/react`, `@emotion/react`, `@tanstack/react-form`, `@tanstack/react-query`,
`@tanstack/react-table`, `date-fns` (`^4.4.0`), `react`, `react-icons` and `zod` (`^4.6.7`).

`/form` calls `z.config({ jitless: true })` when it loads, so Zod never probes `eval` and a Content-Security-Policy
without `unsafe-eval` stays quiet. `package.json` lists that file in `sideEffects`; a bundler must keep it.

Licensed under the Apache License 2.0.
