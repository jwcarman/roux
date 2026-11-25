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

## Check

`make dev` serves <http://localhost:5173> with the app's name in the tab (not `__APP_NAME__`) and
signs in; editing a Go file restarts the server.

## Pitfalls

- Copying the Makefile from roux's repository: it builds `bin/roux-app`, not the app's binary.
- Skipping the template half: the app compiles, but `make dev` is the old one-shot build.
- `npm create` with a path, or in the app's own folder: it takes a bare name and refuses a
  directory that exists; `cd` to a new folder first.
