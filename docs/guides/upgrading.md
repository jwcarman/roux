# Upgrading

An app has two parts from roux, and they upgrade differently.

- **roux's packages**, `github.com/jwcarman/roux` and `@jwcarman/roux-web`: raise the versions and
  fix what no longer compiles. A breaking change fails loudly (a compile error, a type error, a
  test), and the [changelog](https://github.com/jwcarman/roux/blob/main/CHANGELOG.md) says what to
  do for each.
- **The files the template gave the app** (the Makefile, `scripts/dev.sh`, `vite.config.ts`...):
  they became the app's own when it was made, and an upgrade never changes them. Each release below
  lists the ones it changed, to bring over by hand.

Upgrade one release at a time, oldest first: each section assumes the one before it.

## How

1. **The packages**, in the app's directory:

   ```bash
   go get github.com/jwcarman/roux@v0.6.1 && go mod tidy
   (cd frontend && npm install @jwcarman/roux-web@0.6.1)
   ```

2. **The release's template**, to copy from: a fresh app at that version, under the app's own name,
   outside the app:

   ```bash
   mkdir -p /tmp/roux-0.6.1 && cd /tmp/roux-0.6.1
   npm create @jwcarman/roux-app@0.6.1 team-planner -- --name "Team Planner"
   ```

   Its files carry the app's name where the template does (the Makefile's `bin/team-planner`), so
   a file the app never edited is copied whole; one it changed is merged.

3. **The steps for the release**, below.

4. **The gates**: `make check`, and in `frontend/` `npm run lint`, `npm run coverage` and
   `npm run build` (which type-checks). Then `make dev`, and sign in.

## 0.4.0 to 0.5.0

**The packages.**

- `historyQuery` is `activityQuery` (`@jwcarman/roux-web/activity`), with the same arguments:
  rename the import and the calls. The type check names each one.
- A user's history (`GET /api/roux/users/{id}/activities`) shows only roux's `user.*` kinds. An
  app whose own kinds are named `user.*` renames them (a new `Type()`; old rows keep the old code).
- The organization's context has a `weekStart`. A test fixture that builds the context by hand
  adds `weekStart: 0` (`testOrganization()` has it).

**The template's files.** `make dev` became the live loop (the server under air, Vite at
<http://localhost:5173>), and the lint is pinned:

| File | What to do |
| --- | --- |
| `.air.toml`, `scripts/dev.sh` | Copy (new files). |
| `go.mod` | `go get -tool github.com/air-verse/air@v1.67.4` (air is a `go tool`), then `go mod tidy`. |
| `Makefile` | Merge: `dev` runs `scripts/dev.sh` after its `frontend/node_modules` prerequisite; `lint` builds the pinned golangci-lint (`GOLANGCI_LINT_VERSION`, the `$(GOLANGCI_LINT)` rule); the new `frontend/node_modules/.package-lock.json` and `frontend/dist/index.html` rules. |
| `e2e/run.sh` | The front-end line is `make --no-print-directory frontend/dist/index.html`. |
| `frontend/vite.config.ts` | Copy, or merge the `serverShell()` plugin and `server.port: 5173` with `strictPort`. |
| `frontend/index.html` | The theme script is `<script nonce="__CSP_NONCE__">`. |
| `.gitignore`, `.dockerignore` | Add `/tmp/` and `tmp` (air's build). |

## 0.5.0 to 0.6.0

**The packages.**

- `react-dom` is a peer dependency of `@jwcarman/roux-web`. An app made from the template already
  has it; one without it runs `npm install react-dom` in `frontend/`.
- `<TableView insetFooter>` is gone: delete the prop. A Card around a lone table pads its footer
  and empty message itself.
- The theme has a `depth` (`flat` or `raised`). roux's migration adds it to the stored theme, and
  `/api/roux/theme` requires it on a save, so update the server and the front end together. A test
  that builds a theme by hand adds `depth: "flat"`; the type check names each one.
- Nothing else is required. Surfaces, `cqrs`, `app.Config.Look` and `scope.Kinds` are new and
  optional: an app takes them up feature by feature (the [surfaces](surfaces.md) guide says how to
  set one up).

**The template's files.**

| File | What to do |
| --- | --- |
| `frontend/src/routes/_signedIn/-appearance.test.tsx` | The theme in its fixture adds `depth: "flat"`. |

## 0.6.1 to 0.6.2

**The packages.** Nothing to change.

**The template's files.** Optional: they give the app `make verify` (every check) and let
`make e2e` use services it is given, not only Docker's.

| File | What to do |
| --- | --- |
| `Makefile` | Take the template's `verify` and `services` targets; `dev` runs `services`, `e2e` no longer starts anything. |
| `e2e/run.sh` | Take the template's, keeping any settings your app adds to the server's line. |
| `cmd/e2edb/` | Copy both files, then `go mod tidy` (it makes `github.com/jackc/pgx/v5` a direct requirement). |

After this, `make e2e` on your machine needs `make services` (or `make dev`) first.

## 0.6.0 to 0.6.1

**The packages.** Nothing to change. `@jwcarman/roux-web` now accepts `@testing-library/jest-dom` 8
as well as 7, so an app may move to jest-dom 8 (it needs Vitest 5).

**The template's files.**

| File | What to do |
| --- | --- |
| `frontend/package.json` | Optional: `@testing-library/jest-dom` `^8.0.0`, then `npm install`. |
