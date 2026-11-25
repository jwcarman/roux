# roux on Go: replacing the Java runtime

Date: 2026-11-24. Status: draft for James's approval.

## Why

Go is the better agentic experience: faster feedback (a build and test loop in seconds, not a Maven
reactor), one small self-contained binary, and less framework to know. roux is built for agents, so
from 0.4.0 its backend runtime is Go. The prototype, gomer (`~/GolandProjects/gomer`), already
implements most of roux's server against the same HTTP contract, and the app template's Playwright
suite passes against it unchanged.

## Goals

1. Everything roux's Java runtime does in 0.3.0, written in Go, in this repository.
2. Every endpoint roux provides lives under `/api/roux/`, including who's (`/api/roux/who/*`);
   roux-web calls them there.
3. The Java code, the Maven build and the Maven Central publishing leave the repository.
4. `npm create @jwcarman/roux-app` makes a Go app; the skill, guides and evals teach Go.
5. A new example app, **Roux The Day** (a team's shared planner), replaces the dojo: built on the
   Go runtime in rounds, it is where roux finds out what is still hard for an app.

## Non-goals

- No migration path for apps generated from roux 0.1 to 0.3 (Java). They keep working on what is
  published; there are no further Java releases.
- No change to who-client: it already takes `baseUrl` (default `/who`), so roux-web passes
  `/api/roux/who`.
- No change to the who Java library or to noir (noir is private; it moves on its own schedule).
- No port of the dojo. It is deleted with the Java code; the `0.3.0` tag keeps it.
- No Go mutation testing in 0.4.0 (my call: Go's mutation tools are immature; the front end keeps
  Stryker). Revisit after 0.4.0.

## Anti-goals

- A Go runtime that is "mostly there": 0.4.0 does not ship until the template and Roux The Day pass
  their suites on Go and every Java module's public surface has a Go home.
- Two runtimes side by side. Java is removed, not kept in a corner.
- Framework magic. gomer's conventions (stdlib `net/http`, pgx without an ORM, errors returned and
  mapped at the edge, modules listed in `main`) are the design, not something to grow out of.

## Constraints

- Go 1.27, `net/http` routing, pgx v5, PostgreSQL only (as today).
- The Go module is at the repository root, module path `github.com/jwcarman/roux`; apps import
  `github.com/jwcarman/roux/users` and so on. `go.mod` has `ignore node_modules` (Go 1.25+), so
  Go never walks into the npm workspace's dependencies.
- Versions: the GitHub Release tag stays the bare `X.Y.Z` (no `v`, as everywhere else). Go only
  resolves `vX.Y.Z` tags, so the release workflow also pushes `vX.Y.Z` on the release's commit.
  That tag is the only place a `v` appears. Nothing else is published for Go: the module proxy
  serves the tag.
- Migration names are permanent (gomer's notes): renaming one re-runs it. They come over as they
  are (`roux-authn`, `roux-users`, ...).
- The shared fixtures in `contracts/*.json` stay the single source both sides test against: Go
  tests read them as roux-web's tests do.
- No license headers in source files: the root `LICENSE` (Apache 2.0) covers the repository, and
  headers cost tokens on every file an agent reads. The Java runtime's mycila license check goes with it.
- gomer is a private repository and roux is public. gomer's files are copied in (as of its commit
  `0cf33f8`), not its history, and gomer itself is not changed.

## Approaches considered

- **A. gomer's code moves into the roux repository (chosen).** One repository holds the Go runtime,
  roux-web, create-roux-app, the template, the example and the skill. A contract change (the
  `/api/roux` move above all) is one commit tested in one place; one release versions everything.
- **B. gomer stays its own repository and publishes the runtime.** Every contract change becomes two
  commits in two repositories released in lockstep. Only worth it if Go and npm should version
  separately, which nobody asked for.
- **C. Bring Go in beside Java and delete Java at parity.** Two runtimes on main is the anti-goal,
  and nobody depends on main between releases. Java goes in the same push that brings Go in.

Layout: a `go/` subdirectory module was tried first (a tidy top level) and dropped: it puts
`/go` in every import in every app (`github.com/jwcarman/roux/go/users`), in every skill example
and on pkg.go.dev, and Apache Arrow's Go library left that shape for its own repository. The
import path is what agents see thousands of times; the repository root is seen by few. So the
module is at the root, and `web/` stays as it is (one npm workspace and lock).

## Layout after the move

```
go.mod  Makefile       module github.com/jwcarman/roux; `make check`
api/ apperr/ problem/ page/ pgdb/ pgtest/ health/ telemetry/ spa/ app/
authn/ (emaillink, passkey, oidc, jwt, apikey, authntest)
authz/ users/ activity/ theme/ organization/
money/ validation/ email/ audit/ rouxtest/        new for parity (below)
web/                   npm workspace, unchanged: roux-web/, create-roux-app/, lint-tools/
template/              the Go app create-roux-app ships: cmd/server, frontend/, e2e/, Makefile, compose
examples/roux-the-day/ the example app on Go: cmd/server, its packages, frontend/, e2e/
contracts/  plugins/roux/  docs/  scripts/
```

- gomer's `roux/*` packages are the root packages. gomer's `cmd/server`, `frontend`, `e2e`, `deploy`,
  `docker-compose.yml`, `Makefile` and `examples/items` (the reference resource) become
  `template`. gomer's `examples/frontend` stand-in page goes into `spa` as its fallback.
- Each app's front end lives inside the app (`template/frontend`,
  `examples/roux-the-day/frontend`): Go's `embed` cannot reach outside a package's directory, and
  that is how the release build is one binary with the front end inside.
- `template` and `examples/roux-the-day` each have their own `go.mod`, with a `replace` onto
  `..` (template) or `../..` (Roux The Day) inside this repository; a directory with its own
  `go.mod` is outside the root module, so `go test ./...` at the root covers only the runtime.
- gomer's CLAUDE.md splits in two: the runtime's conventions go to the repository's CLAUDE.md, the
  app's conventions (how to add a resource, errors, paging, modules) to `template/CLAUDE.md`,
  which every generated app inherits.
- Removed: `runtime/`, root `pom.xml`, `mvnw*`, `.mvn/`, `lombok.config`s, `examples/dojo`, the
  Java sources and pom of `template`, `scripts/native-remote.sh` (a Go binary needs no native
  image), and every Maven step in CI and release.

## The `/api/roux` move

| Today | 0.4.0 |
|---|---|
| `/who/*` | `/api/roux/who/*` |
| `/api/users`, `/api/users/me` and below | `/api/roux/users`, `/api/roux/users/me` |
| `/api/theme` | `/api/roux/theme` |
| `/api/organization` | `/api/roux/organization` |
| `/api/roles/invitable` | `/api/roux/roles/invitable` |
| `/api/roux/healthz`, `/readyz` | unchanged |

- Everything roux registers uses `HandleRoux`; `api.Mux` keeps refusing application routes under
  `/api/roux/`. An app's own routes stay `/api/<resource>`.
- roux-web: who-client gets `baseUrl: "/api/roux/who"`; roux-web's own calls move to the new paths;
  the Vite proxy needs only `/api`.
- Provider sign-in redirect URIs become `/api/roux/who/oidc/callback/{provider}`: the guides and the
  dev Keycloak realm say so (a breaking change for anyone registering a provider; the CHANGELOG
  says it).
- The spa's excluded paths drop `/who/**` (now under `/api/**`).

## Parity: what Go gains

Ported from the Java module of the same purpose; each keeps the Java version's rules and messages,
because roux-web shows the messages as written.

- **`money`**: a `Money` (minor units + currency), parsing and the rules in `contracts/money.json`
  (`Must be an amount`, `Must be more than 0`, `Must be in USD`, ...), the org's default currency,
  its JSON shape and a pgx type for its column(s).
- **`validation`**: `Phone`, `NotInFuture`, `After` as functions that return roux's field errors
  for `problem.Validation`, with the rules and messages from `contracts/phone.json`, `time.json`
  and `after.json`.
- **`email`**: roux's finished emails (sign-in, invitation) from `roux-email`, and an app sending
  its own templated email through the same sender, with a recording sender for tests.
- **`audit`**: created/updated at and by on an app's rows, the clock (one source of now, settable
  in tests), `Versions.Require` (the stale-version 409, and the field error when `version` is
  missing), and `Idempotent.Insert` (transaction-scoped advisory lock, then exists-check, then
  insert; the unique constraint stays the backstop).
- **`rouxtest`**: what `roux-test` gives an app's tests: a test database (my call:
  `TEST_DATABASE_URL` when set, otherwise a Postgres container via testcontainers-go, so a fresh
  app's tests need nothing but Docker), test users signed in with given roles, recorded mail, a test
  clock, and the assembled app on an `httptest.Server` (`AppTest`'s equivalent).
- **Contract tests**: Go tests in the packages that own each contract read `contracts/*.json` and
  check the server's answers (problem shapes, paging, session, activity, invitable roles, email,
  idempotent), replacing `roux-contract-tests`.
- Anything else a Java module does that this list misses is a gap too: the parity phase starts with
  a module-by-module audit (each Java public type → its Go home, or "not needed, because ...").

## The template and create-roux-app

- `template` is gomer's app: `cmd/server` (`main.go`, `modules.go`), its own migrations, the
  items reference resource, the roux-web frontend, the Playwright suite, compose (Postgres,
  Mailpit), a Makefile.
- Gates in a generated app (my call, matching the Java template's spirit): `gofmt`, `go vet`,
  golangci-lint, the Go tests with a 100% statement-coverage gate, and the front end's existing
  gates (format, lint, typecheck, coverage, build, Stryker).
- `scripts/export-app-template.sh` drops its Maven work and instead removes the `replace` and pins
  the runtime at the release (`go mod edit -require github.com/jwcarman/roux@vX.Y.Z`, then `go
  mod tidy`). create-roux-app bundles the template as before; a generated app needs Go 1.27, Node
  and Docker.

## Roux The Day

A shared planner for a team: people plan the team's days together, and things are assigned to
people. It starts as a copy of the template (sign-in, roles, invitations, Appearance, Settings,
activity) and grows in rounds, each round adding a feature and logging what was hard in
`FINDINGS.md`; what more than one app would need is extracted into roux.

What it exercises, so the runtime is proven by an app and not only by its own tests:

| roux | In Roux The Day |
|---|---|
| Dates, time zones | days, timed and all-day items, the team's time zone, "today" per person |
| Users, roles, invitations | team members, an organizer role, inviting people to the team |
| Assignment, the directory | items assigned to one or more people; "my day" and "assigned to" filters |
| Paging, sorting, filters | the item list: overdue, this week, by assignee, by status |
| Versions (409) | two people editing the same item |
| Idempotent insert | checking an item off twice (double tap, two devices) is one check-off |
| Activity log | an item's history: created, moved, reassigned, completed |
| Email | an email when something is assigned to you |

Money and phone have no natural place in it; the contract tests and the template cover them. The
rounds after the first are planned when they come, like the dojo's were.

## The skill, guides and evals

- Every reference under `plugins/roux/skills/roux/references` and every guide in `docs/guides` is
  rewritten for Go (front-end parts mostly stand; paths change to `/api/roux`). `check-guides.mjs`
  learns Go: every exported roux name is in a guide and a reference, every
  `github.com/jwcarman/roux/...` import a reference shows exists. `check-recipe.sh` builds its
  feature into a fresh Go template.
- The evals run again against the Go skill (Haiku, about $2 a run, per PROTOCOL.md) to show the
  skill still saves turns, time and cost to a green build.

## CI and release

- CI: `go` (gofmt, vet, golangci-lint, tests with a Postgres service, coverage), `web` (unchanged
  apart from paths), `plugin` (Go recipe), and on pushes to main the template's and Roux The Day's
  Playwright suites against their built binaries. SonarCloud stays (it reads Go coverage).
- Release on a bare `X.Y.Z` GitHub Release: check the tag, push `vX.Y.Z` on the same commit and
  check `proxy.golang.org` resolves it, publish roux-web, then create-roux-app (needs both). The
  Maven job, its jar attestation and the Central secrets go: a Go module is source, which
  `sum.golang.org` pins, and the npm packages keep their provenance.

## Phases

Each leaves main green; each gets its own plan, written when it starts.

1. Copy gomer in (the root packages, `template/`), remove Java, CI on Go.
2. The `/api/roux` move, server and roux-web together.
3. Parity: the Java module audit, then `money`, `validation`, `email`, `audit`, `rouxtest`,
   contract tests.
4. The template's gates, the export script and create-roux-app.
5. Roux The Day, first round.
6. The skill, guides and evals; the release workflow; cut 0.4.0.

## Left to the builder

Package-internal design, test structure, the order inside each phase, and how the Java module audit
is recorded, as long as the conventions in gomer's CLAUDE.md hold and each phase leaves main green.
