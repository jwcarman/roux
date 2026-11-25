<p align="center">
  <img src="docs/assets/favicon.svg" alt="roux: a skillet of roux, stirred" width="128">
</p>

# roux

roux is said "roo". It is the base a Go + React business application is built on: sign-in,
roles and permissions, the team, errors a person can read, paged lists, forms, money, dates and the
activity log, written once with contracts that keep both sides honest.

**roux is written for agents.** Its users are coding agents building apps, so it is designed for
them to get right the first time: one way to do each thing, exact names that match across Go,
TypeScript and the docs, mistakes that fail loudly (a compile error, a test naming the fix, a
check that refuses) rather than silently, and an [Agent Skill](plugins/roux) that ships the
knowledge with the code. Every example in the docs is code CI builds. People read it too; agents
come first.

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
- `@jwcarman/create-roux-app` (`web/create-roux-app`): `npm create @jwcarman/roux-app team-planner`
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

A release is a GitHub Release whose tag is the Go module's version, `v0.4.0` (`v0.4.0-rc.1` for a
pre-release): the Go module proxy only takes tags that start with `v`. npm gets the same version
without the `v`. Nothing in the repository holds a version, so there is nothing to bump after.

1. **Main is green**: CI and Mutation passed on the commit to release.
2. **The changelog and the skill**: in `CHANGELOG.md`, rename `## [Unreleased]` to
   `## [0.4.0] - YYYY-MM-DD`, start a fresh `## [Unreleased]` above it, and add
   `[0.4.0]: https://github.com/jwcarman/roux/releases/tag/v0.4.0` (and point `[Unreleased]` at
   `v0.4.0...HEAD`). Make the skill's "covers roux" line (`plugins/roux/skills/roux/SKILL.md`)
   the release. Commit and push.
3. **The release**: `gh release create v0.4.0 --title v0.4.0 --notes-file notes.md`, the notes
   being the changelog's section. Add `--prerelease` for a pre-release.

That runs `.github/workflows/release.yml`:

- **verify**: the tag is a Go module version, the changelog has its section, the module builds, the
  template exports, and both npm packages rehearse their publish. Nothing publishes unless it passes.
- **go**: asks the Go module proxy for the release, so `go get github.com/jwcarman/roux@v0.4.0`
  works (and pkg.go.dev lists it) at once.
- **npm**: publishes `@jwcarman/roux-web` (a pre-release under the dist-tag `next`).
- **starter**: once both serve the release, bundles the app template with its `go.sum` and
  frontend lock resolved against them, builds the bundled server, and publishes
  `@jwcarman/create-roux-app`.

If a job fails, use "Re-run failed jobs" rather than re-running everything: npm will not accept the
same version twice. A tag is never moved once the proxy has served it: the proxy and the checksum
database keep the first contents for good, so a broken release is fixed by the next version.

npm publishing uses [trusted publishing](https://docs.npmjs.com/trusted-publishers) (OIDC), so there
is no npm token secret. On npmjs.com, each package (`@jwcarman/roux-web`, `@jwcarman/create-roux-app`)
→ Settings → Trusted publishing names GitHub user `jwcarman`, repository `roux` and workflow
`release.yml`; renaming the workflow file breaks publishing until that entry is updated. Provenance
is generated automatically.
