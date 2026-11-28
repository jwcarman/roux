# Upgrading roux

An upgrade has two halves: roux's packages (raise the versions, fix what fails) and the files the
template gave the app, which never change on their own. Do both, one release at a time, oldest
first.

## Rules

- Upgrade one release at a time; each section assumes the one before.
- Copy a template file whole only when the app never edited it (`git log --oneline -- <file>` shows
  just the first commit); otherwise merge the release's change into it.
- Copy from a fresh app at the target version under the app's name and display name, never from
  roux's repository: its files carry the app's name.
- Done is the gates passing and `make dev` serving the app, not the code compiling.

## Steps

1. Packages: `go get github.com/jwcarman/roux@v<version> && go mod tidy`, then in `frontend/`
   `npm install @jwcarman/roux-web@<version>`.
2. Template: in a new folder outside the app (`mkdir -p /tmp/roux-<version> && cd /tmp/roux-<version>`),
   `npm create @jwcarman/roux-app@<version> <app-dir> -- --name "<App Name>"`: the app's directory
   name (a bare name, not a path) and display name.
3. The release's section below.
4. Run the skill's `scripts/check.sh` until `check: ok`; then `make dev` starts and answers at
   <http://localhost:5173>.

## 0.4.0 to 0.5.0

Packages:

- `historyQuery` → `activityQuery` (`@jwcarman/roux-web/activity`), same arguments.
- A user's history shows only roux's `user.*` kinds: rename any app kind named `user.*`.
- `OrganizationContext.weekStart` is required: a hand-built test context adds `weekStart: 0`.

Template files:

- Copy `.air.toml` and `scripts/dev.sh` (new).
- `go get -tool github.com/air-verse/air@v1.67.4`, then `go mod tidy`.
- `Makefile`: merge `dev` (runs `scripts/dev.sh`, prerequisite `frontend/node_modules/.package-lock.json`),
  `lint` (the pinned `GOLANGCI_LINT_VERSION` and its `$(GOLANGCI_LINT)` rule), and the rules for
  `frontend/node_modules/.package-lock.json` and `frontend/dist/index.html`.
- `e2e/run.sh`: the front-end line is `make --no-print-directory frontend/dist/index.html`.
- `frontend/vite.config.ts`: the `serverShell()` plugin, `server.port: 5173`, `strictPort: true`.
- `frontend/index.html`: the theme script is `<script nonce="__CSP_NONCE__">`.
- `.gitignore` `/tmp/`, `.dockerignore` `tmp`.

## 0.5.0 to 0.6.0

Packages:

- `react-dom` is a peer of `@jwcarman/roux-web`: `npm install react-dom` in `frontend/` if missing.
- `<TableView insetFooter>` is gone: delete the prop.
- The theme's `depth` (`flat` | `raised`) is required on a save; roux migrates the stored theme. A
  hand-built test theme adds `depth: "flat"`.
- Surfaces, `cqrs`, `app.Config.Look`, `scope.Kinds`: new, optional; nothing to change.

Template files:

- `frontend/src/routes/_signedIn/-appearance.test.tsx`: the fixture's theme adds `depth: "flat"`.

## 0.6.3 to the next release

- Packages: nothing.
- Template files: roux's skill now ships in the app as `.claude/skills/roux/`, copied as it is. Copy
  that folder from the fresh app, and remove `extraKnownMarketplaces` and `enabledPlugins` from
  `.claude/settings.json` (delete the file if nothing else is left), or the skill loads twice.
- From now on, every upgrade replaces `.claude/skills/roux/` whole with the fresh app's copy.

## 0.6.2 to 0.6.3

- Packages: nothing to change. `app.Main` now reads service bindings and `.env` (neither there:
  as before).
- Template files, optional: the `Makefile`'s `verify` target (fastest first); `"typecheck": "tsc -b"`
  in `frontend/package.json`'s scripts; `cmd/e2edb/` replaced by `cmd/e2eservices/`; the template's
  `e2e/run.sh` (keep the app's own server settings) and `scripts/dev.sh`.

## 0.6.1 to 0.6.2

- Packages: nothing. Template files, optional (`make verify`, and `make e2e` on given services):
  `Makefile` (`verify`, `services`; `dev` runs `services`; `e2e` starts nothing), `e2e/run.sh`
  (keep the app's own server settings), `cmd/e2edb/` (both files, then `go mod tidy`).
- After it, `make e2e` needs `make services` (or `make dev`) first.

## 0.6.0 to 0.6.1

- Nothing required. roux-web accepts `@testing-library/jest-dom` 7 or 8; the template moved to
  `^8.0.0` (needs Vitest 5), optional for an app.

## Check

`make dev` serves <http://localhost:5173> with the app's name in the tab (not `__APP_NAME__`) and
signs in; editing a Go file restarts the server.

## Pitfalls

- Copying the Makefile from roux's repository: it builds `bin/roux-app`, not the app's binary.
- Skipping the template half: the app compiles, but `make dev` is the old one-shot build.
- `npm create` with a path, or in the app's own folder: it takes a bare name and refuses a
  directory that exists; `cd` to a new folder first.
