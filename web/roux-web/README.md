# @jwcarman/roux-web

The web half of [roux](https://github.com/jwcarman/roux): the React plumbing a roux application needs, written
once. It is ESM-only and has one subpath per concern.

## Subpaths

- `@jwcarman/roux-web/problem`: types and helpers for RFC 9457 Problem Details.
- `@jwcarman/roux-web/api`: the API client, server actions, and error notification.
- `@jwcarman/roux-web/paging`: paging types and helpers.
- `@jwcarman/roux-web/table`: a TanStack Table wrapper driven by a query.
- `@jwcarman/roux-web/feedback`: toasts, confirmation dialogs and error messages.
- `@jwcarman/roux-web/form`: TanStack Form fields and dialogs.

## Peer dependencies

The app supplies `@chakra-ui/react`, `@emotion/react`, `@tanstack/react-form`, `@tanstack/react-query`,
`@tanstack/react-table`, `react` and `react-icons`.

See the [repository README](https://github.com/jwcarman/roux#readme) for the Java modules and how to use roux.

Licensed under the Apache License 2.0.
