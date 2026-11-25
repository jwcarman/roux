# roux

roux is said "roo". It is the base a Go + React business application is built on: sign-in,
roles and permissions, the team, errors a person can read, paged lists, forms, money, dates and the
activity log, written once with contracts that keep both sides honest.

Documentation: <https://jwcarman.github.io/roux/>.

## Packages

Go, the module `github.com/jwcarman/roux` (this repository's root). An app imports what it uses:

- `app`: `app.Main`, the kit a module mounts on, and the stock modules read from the environment.
- `problem`, `api`: RFC 9457 Problem Details, JSON decoding and answers, the router's guards.
- `page`: paged, sorted and searched lists over a view.
- `authn` (with `emaillink`, `passkey`, `apikey`, `oidc`, `jwt`), `authz`, `users`: sign-in, roles
  and permissions, the team.
- `activity`, `money`, `organization`: a record's history, amounts, the organization's zone and day.
- `pgdb`, `spa`, `theme`, `health`, `telemetry`: migrations, the page shell and its CSP, the owner's
  theme, probes, OpenTelemetry.
- `rouxtest`, `pgtest`, `authn/authntest`: an app's tests over PostgreSQL, with signed-in browsers.

`contracts/` holds what the Go and web sides must agree on (messages, problem shapes), and tests on
both sides read it.

Web, published to npm:

- `@jwcarman/roux-web` (`web/roux-web`): the React side, with one subpath per concern (`problem`,
  `api`, `paging`, `table`, `feedback`, `form`, `auth`, `signin`, `session`, `users` and more).
- `@jwcarman/create-roux-app` (`web/create-roux-app`): `npm create @jwcarman/roux-app acme-gym`
  starts a new app from the template below, at the same release.

Apps, never published as they are:

- `template/`: the app every new app starts from (sign-in, the first owner, the sidebar frame,
  Users, Settings and Appearance), built and tested in roux's build against the packages beside it.
- `examples/roux-the-day/`: a team planner built on roux in rounds, where roux's pieces are proven
  before they are extracted (`FINDINGS.md` records what it was missing).

## Using roux

Every roux app is a Go server with a React SPA on one origin, and PostgreSQL. The guides, published
at <https://jwcarman.github.io/roux/> and kept in [`docs/guides/`](docs/guides/README.md), say how
to build one, one concern each: getting started, a feature's server side, errors, roles and
permissions, users, the API client, queries and mutations, forms, tables and paging, money, dates
and time, the activity log, feedback, the shell, email and testing.

roux's Agent Skill (`plugins/roux`) is the same knowledge written for an agent.

## Building

```
make check             # gofmt, go vet, golangci-lint, and the tests (TEST_DATABASE_URL, or Docker)
```

The database tests use `TEST_DATABASE_URL` when it is set, else a PostgreSQL container per package
(testcontainers-go).

For the web packages, run in `web/` with `-w @jwcarman/roux-web` or `-w @jwcarman/create-roux-app`
(after `npm ci` there and in `web/lint-tools`): `npm run format:check`, `lint`, `typecheck`,
`coverage`, `build`, and `npm run mutate` for mutation testing. Mutation testing is incremental:
Stryker keeps each mutant's result in `.mutation-history/` (git-ignored) and re-tests only what
changed. In CI the `Mutation` workflow caches it between runs.

The template is checked the same way: `make check` in `template/`, and `npm run format:check`,
`lint`, `coverage` and `build` in `template/frontend/`. The docs site builds with
`mkdocs build --strict` (`docs/requirements.txt`). The Agent Skill's checks:
`node plugins/roux/scripts/check-guides.mjs` (every public name documented, every Go name written
exists) and `bash plugins/roux/scripts/check-recipe.sh` (the recipe, built into a copy of the
template).

Go 1.27, PostgreSQL 17, React 19. Licensed under the [Apache License 2.0](LICENSE).

## Releasing

Creating a GitHub Release triggers `.github/workflows/release.yml`; the release tag is the version.
It publishes `@jwcarman/roux-web` to npm, then `@jwcarman/create-roux-app` with the app template at
that version. If a job fails, use "Re-run failed jobs" rather than re-running everything: npm will
not accept the same version twice.

The workflow is still 0.3.0's: it also deploys the Java modules, and the starter bundles the Java
template. Both change before 0.4.0, the first Go release, which also needs a tag the Go module
proxy accepts (`v0.4.0`).

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so there
is no npm token secret. On npmjs.com, each package (`@jwcarman/roux-web`, `@jwcarman/create-roux-app`)
→ Settings → Trusted publishing names GitHub user `jwcarman`, repository `roux` and workflow
`release.yml`; renaming the workflow file breaks publishing until that entry is updated. Provenance
is generated automatically.
