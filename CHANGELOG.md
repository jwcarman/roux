# Changelog

All notable changes to this project are documented in this file. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and versions follow
[Semantic Versioning](https://semver.org/).

## [Unreleased]

## [0.6.4] - 2026-11-28

### Changed

- **A new app carries roux's skill as files.** `create-roux-app` puts the skill in
  `.claude/skills/roux/`, at the app's roux version, copied as it is (the app's names are not put in
  it). Claude Code loads it with nothing to install, so a headless agent (`claude -p`) gets it too;
  it never installed the plugin the app's `.claude/settings.json` named, which the app no longer
  names.

## [0.6.3] - 2026-11-27

### Added

- **Service bindings: `bindings.Apply`.** A platform can mount its services as files
  ([servicebinding.io](https://servicebinding.io)) under `SERVICE_BINDING_ROOT`: `postgresql`, `smtp`
  (roux's own type) and `mailpit` set `DATABASE_URL` and `TEST_DATABASE_URL`, `SMTP_ADDR` (with
  `SMTP_USERNAME`, `SMTP_PASSWORD`, `MAIL_FROM`) and `E2E_MAILPIT_URL`. A variable already set wins;
  a binding that cannot be read, lacks an entry or shares its type with another stops startup,
  naming it. `pgtest` reads them too.
- **`.env`, and `app.LoadEnv`.** `app.Main` reads service bindings, then `.env` in the working
  directory, before anything reads the environment, never overwriting: a variable set wins, then a
  binding, then `.env`, then roux's defaults. `make dev`'s defaults give way to `.env` too.

### Changed

- **The template's `cmd/e2edb` is `cmd/e2eservices`.** It finds the Playwright suite's Postgres and
  Mailpit as the app finds its settings (bindings and `.env` included), makes `app_e2e`, checks
  Mailpit, and gives both to `e2e/run.sh`, which no longer sets `SMTP_ADDR` itself.
- **`make verify` runs fastest first.** The static checks (gofmt, `go vet`, golangci-lint, Prettier,
  ESLint and the new `npm run typecheck`), then the Go and Vitest tests, then the release build
  (`make build`), then the Playwright suite, so a formatting slip fails in seconds, not after the
  tests.

## [0.6.2] - 2026-11-27

### Added

- **`make verify` and `make services` in the template.** `make verify` runs every check an app has,
  stopping at the first failure: `make check`, the front end's format check, lint, coverage and
  build, then the Playwright suite. `make services` starts Postgres and Mailpit in Docker; `make dev`
  runs it.

### Changed

- **`make e2e` starts nothing.** It uses the Postgres and Mailpit it is given (`DATABASE_URL`,
  `SMTP_ADDR`, `E2E_MAILPIT_URL`), which default to `make services`' on this machine, and stops
  naming the address when one does not answer. The new `cmd/e2edb` makes `app_e2e` on that server,
  so the suite needs neither Docker nor Postgres's tools: with those and `TEST_DATABASE_URL` set,
  `make verify` runs in a container without Docker.

## [0.6.1] - 2026-11-27

### Fixed

- **`@jwcarman/roux-web` installs beside jest-dom 8.** Its optional peer `@testing-library/jest-dom` was `^7.0.1`,
  so npm refused it (ERESOLVE) in an app on jest-dom 8.0.0, the current one. It is `^7.0.1 || ^8.0.0`; roux, the
  template and Roux The Day test on 8.0.0 (which needs Vitest 5, as roux already does).
- **A surface `Form`'s fields check once on submit.** The extra `onSubmit` validator added in 0.6.0 repeated the
  `onBlur` check a submit already runs; it is gone, and nothing a person sees changes.

## [0.6.0] - 2026-11-27

### Changed

- `@jwcarman/roux-web` now lists `react-dom` as a peer dependency (the page width narrows before paint with its
  `flushSync`); install it beside `react`. `<TableView insetFooter>` is gone: a Card around a lone `DataTable` pads the
  table's footer and empty message itself, and a `DataTable` straight in a Column keeps its footer flush.
- **The look, as mockup B.** A `FilterChips` shows its `label` above the chips (still the group's accessible
  name), so a chips group lines up with the fields in its Row. A Button in a Row lines up with the bottom of
  the inputs beside it, not of the space each field keeps for a message. A DataTable alone in a Card fills it
  edge to edge, takes the Card's background, and pads its empty message. `AppShell` leaves the page background to the theme, so a raised theme's tinted page shows; the
  raised dark page is black and its cards `gray.950`, so inputs' borders stay visible on a card.

### Added

- **`FilterChips` in the catalog.** One filter as a row of chips, one chosen at a time: `label`, a bound
  `value` (text) and literal `options` of `{value, label}`. Choosing a chip writes its value to the path.
  For a short fixed list; `SelectField` stays for longer or growing ones. Needs no `Form`.
- **Catalog 0.2.0: `Stat` tone, a column's `emptyText`, buttons in Rows.** A `Stat` takes `tone`
  (`accent` or `danger`) and colors a non-zero number (zero, zero money and nothing stay plain). A
  DataTable column takes `emptyText`, shown muted when its value is `null`, `""` or an empty list, in any
  format. A Button in a Row takes its own width and lines up with the bottom of the fields beside it.
  `CATALOG_VERSION` is `0.2.0`.
- **Surfaces get the wide column: `useWidePage()`.** While any mounted component calls it, `AppShell`'s
  page is `6xl` wide instead of `3xl`; outside an `AppShell` it does nothing. `<Surface>` calls it, so
  surface pages are wide and built-in pages keep the narrow column.
- **An app names its default look: `app.Config.Look`.** `spa.Clean`, `spa.Friendly`, `spa.Bold`,
  `spa.Calm` and `spa.Classic` (a `spa.Look`: palette, shape, depth, fonts; the same five as roux-web's
  `LOOKS`, held in `contracts/looks.json`) or a `spa.Look` of your own; the zero value is `Clean`.
  It is the theme until the owner chooses (`Kit.DefaultTheme`, the users module's defaults), part by
  part. `Run` refuses an invalid `Look`. Roux The Day is `Friendly`.
- **The theme has a depth: `flat` or `raised`.** `spa.Theme.Depth` (`depth` in the page's theme and
  in `/api/roux/theme`, required on a save; migration `002_depth.sql`) and roux-web's `Depth`.
  `raised` tints the page and stands the cards on it with a soft shadow; `flat` is as before
  (Clean is `flat`). The Appearance page shows both on sample cards, and Friendly and
  Calm are `raised`. A theme written into a page without a `depth` is refused: update the server
  and the app together.
- **A feed can show only the app's kinds: `scope.Kinds(kinds...)`.** A kind is a type or any part
  of one up to a dot, so `activity.About(kid).Kinds("allowance")` is a kid's `allowance.*` rows
  and nothing else (not roux's `user.*`, not `allowances.*`). `Kinds()` with none, or a kind that
  could not be a type, is an error. A feed without it shows every kind, as before. Found by an
  agent keeping its own SQL for a family's allowance feed.
- **Typed queries and commands: package `cqrs`.** A feature's reads and changes are its ports:
  `cqrs.Query[A, R]` (a paged list, `GET /api/queries/{name}`, answering `page.Page[R]`),
  `cqrs.Lookup[A, R]` (one value) and `cqrs.Command[I, O]` (a change, `POST /api/commands/{name}`,
  answering `{result, events}`), served by `cqrs.Mount`, each its own kit route behind its
  permission. A query's args are `query`-tagged fields with an optional `oneof`; an unknown
  parameter or value is a `400` on it. A command's input `Validate`s itself and its `Run` gets the
  `pgx.Tx`. An `Idempotency-Key` header makes a command safe to repeat: the answer is stored in the
  command log (`cqrs.Module{}`) in the command's own transaction, and a repeat replays it with
  `Idempotent-Replayed: true`. `cqrs.TypeScript(endpoints)` writes the front end's
  `contract.gen.ts` (an interface per type, `Queries`, `Commands`, each one's events); a type it
  can't describe, two types of one name, or two endpoints of one name panic, naming them.
- **Surfaces: an app's feature screens as A2UI JSON.** roux's typed A2UI catalog
  (`@jwcarman/roux-web/a2ui`: `component(...)`, `PRIMITIVES`, `rouxCatalog`, `toA2ui`) and its
  Chakra implementation (`surfaceComponents`, `@jwcarman/roux-web/surface`). `surfaceTypes` and the
  `roux-surface-types` bin generate `<id>.surface.gen.ts` from a surface's JSON (the data at each
  path, what each event carries; `--check` for CI). `surfaces<Queries, Commands>(contract)` gives
  `bind`, which binds each path to a query or a local value and each event to a command, checked by
  the compiler against the generated types and the contract; `<Surface>` renders it on TanStack
  Query, refetching the queries a command's events affect, with an `Idempotency-Key` per attempt,
  field problems under their fields, a skeleton until every query has answered once and an inline
  error with Retry. `DataTable` pages, sorts (`sort`, writing `sortBy`/`sortDirection`), links a
  column to a route (`link`), and formats `time` and `list` cells. Needs `@a2ui/react`,
  `@a2ui/web_core` and `zod3` (optional peers).
- **Roux The Day's items list is a surface**: `items.surface.json` bound to the `items` and
  `itemCounts` queries and the `addItem` command, replacing the hand-written page and dialog.

### Fixed

- **A surface's `Form` submits as roux's forms do.** A `Form` was a plain box: Enter in a field did nothing (in Roux
  The Day's add bar only a click on "Add item" added), and its Button sent whatever the fields held. It is now roux's
  `form.Form` around its TanStack form, and its one solid Button is its submit: a click or Enter in a field checks
  every field, shows each failing check, and runs the Button's action only if all pass. An outline or ghost Button (a
  Cancel) runs its own action and never on Enter. A second solid Button in a `Form` shows an error in its place,
  naming the fix (make it outline or ghost).

### Documentation

- **Surfaces are how a feature's screens are built.** New guides: Queries and commands (the app's
  ports, idempotency, the contract), Surfaces (setup, drawing, generated types, the binding, the
  runtime, known limits) and Adding a primitive. "A feature" now builds a whole feature as a
  migration, a domain service, queries and commands, a surface and its binding; Forms and Tables and
  paging describe the React layer under the catalog. The skill's recipe does the same, proven by
  `check-recipe.sh`, and its check script regenerates `contract.gen.ts` and the surfaces' types.
- **Upgrading**: a guide and a skill card for moving an app to a new roux release, one release at
  a time. Each release lists both halves: roux's packages, and the template files that became the
  app's own and never change on their own. 0.4.0 to 0.5.0 is the first.
- **The README has a quick start**: create the app, `make dev`, sign in, then build with an agent.

## [0.5.0] - 2026-11-25

### Breaking changes

- **A user's history shows only roux's own `user.*` kinds.** `GET /api/roux/users/{id}/activities`
  (guarded by `users.read`) used to show every activity related to the user, so an app's private
  rows about a person, such as a kid's allowance entries, could be read by anyone with
  `users.read`, other kids included. An app's activity about a person now shows only in the app's
  own feed (`activity.Feed` with `activity.About(personID)`), under the app's own permission. Don't
  name an app's kinds `user.*`. Found by an agent's final review of an allowance feature.
- **roux-web's `historyQuery` is `activityQuery`** (`@jwcarman/roux-web/activity`), the same
  `(key, url)`: it now serves a feed's endpoint as well as a record's history. Rename the import and
  the calls. `ActivityList`'s error line reads "Could not load the activity."

### Added

- **An activity feed across records: `activity.Feed(ctx, db, names, req, scope)`**, newest first, a
  page at a time, with a scope that must be said: `activity.Everything()` or
  `activity.About(ids...)` (the activity anchored to or related to any of them, such as everything
  about one person). A scope never set, `About()` with no ids, or an empty id is an error, never the
  whole log. The app's endpoint picks the scope by its own permissions, and roux-web's
  `activityQuery` and `ActivityList` show it. Before, an activity page meant SQL of the app's own on
  `roux_activity`. `activity.History` is unchanged.


- **The organization's week start.** `ORG_WEEK_START` names the first day of the week (`Monday`, in
  any case); without it, the week starts where `ORG_LOCALE`'s region starts it (CLDR's data: Sunday
  for `en-US`, Monday for `en-GB`, Saturday for `ar-EG`). It travels in the organization context
  (`organization.Context.WeekStart`, a `time.Weekday`; `weekStart`, 0 to 6, in the browser), and
  roux-web's `firstDayOfWeek(day)` (`@jwcarman/roux-web/dates`) is the first day of the
  organization's week holding a day. `Calendar.WithWeekStart` sets it in Go. roux-web refuses a
  context without `weekStart`: roux-web and the server go up together.

- **`users.ActiveMembers(ctx, db)`**: every active member, by name, for a picker's options (an
  assignee); a feature serves them from its own endpoint instead of querying `roux_user_directory`.

### Changed

- **`make dev` is a live loop at <http://localhost:5173>.** It runs the server under
  [air](https://github.com/air-verse/air) (a Go tool in the app's `go.mod`, configured by
  `.air.toml`; rebuilt and restarted when Go, a migration or an email template changes) and Vite
  together (`scripts/dev.sh`), and sets `PUBLIC_URL` to the Vite address, so sign-in links, passkeys
  and cookies work through its proxy. One Ctrl-C stops both; if either exits, the other is stopped
  and `make dev` fails. Before, `make dev` served a built front end at `:8080` and Go changes needed
  a restart, with `npm run dev` run beside it for pages. Vite now fails rather than take another
  port when 5173 is busy. `make up` is unchanged, the app as deployed at `:8080`.
  The page Vite serves is the server's shell (`serverShell` in `vite.config.ts`, with the server's
  `FRONTEND_DIR=frontend`): the app's name, theme and organization filled in as a deployment does.
  Before, a page from Vite had them unfilled and asked the server for the organization, which
  needs a sign-in, so a signed-out page under `npm run dev` stopped at "Sign in to continue". The
  inline script in `index.html` carries the nonce placeholder itself (the build is unchanged), and
  the dev server listens on `127.0.0.1` only.

- **`make e2e` rebuilds the front end whenever it is out of date** (anything under `frontend/` newer
  than the last build; `npm ci` again when the lock changed), not only when there is no build:
  before, a page changed or merged after the first build was never tested.

- **`make lint` builds its own golangci-lint**, the version the Makefile names
  (`GOLANGCI_LINT_VERSION`, v2.15.0), into `bin/` the first time, so `make check` and the skill's
  `check.sh` never depend on what a machine has installed; before, they used whatever
  `golangci-lint` was on the `PATH` (`check.sh` skipped it when there was none). It is not a Go tool
  in `go.mod`: the linter's dependencies would be resolved together with the app's.

- **A new app's first branch is `main`** (`create-roux-app`), unless git's `init.defaultBranch`
  names another; it was git's built-in default, `master`, where nothing was set.

- **A release no longer waits on the Go module proxy.** The release workflow's proxy job is gone:
  asked for a tag seconds after it was made, the proxy cached "not found" for half an hour and held
  up the starter (0.4.0's). The starter now resolves roux's `go.sum` from the tag on GitHub
  (`GONOPROXY`, `GONOSUMDB`), which gives the hash the checksum database records.

### Fixed

- **No "Encountered a script tag" error in the browser console.** next-themes' before-paint script
  (inside roux-web's `ColorModeProvider`) is now an inert data block: in a single-page app React
  renders it and never runs it, and warned about that on every load. `index.html`'s own inline
  script still sets light or dark mode before the first paint.

### Documentation

- The skill and guides, from a test run of an agent building two features on 0.4.0:
  - When a list is long: one that grows as the app is used (tasks, entries, anything with a date) is
    paged by the server even while it is short.
  - The recipe's Go test has a not-found test of its own: an unknown id, a non-UUID id and a deleted
    row are `404` on every route with an `{id}`. The frontend's coverage gate forces failure paths;
    nothing forced the Go ones.
  - A route's `validateSearch` returns every key (`undefined` when bad): the router lays it over the
    raw URL, so a key left out let the bad value through. The dates card points to `dateSearchOf`.
  - jsdom: a closed Chakra dialog stays in the page (`data-state="closed"`), a checkbox's state is its
    root's, and a refused optimistic toggle is put back after the failure toast.
  - The references name every export, so an agent need not read roux's source to confirm one; the
    TypeScript language server may not start with TypeScript 7, and `npm run build` is the type check.
  - A new app's Claude Code settings install roux's skill when the folder is trusted; the starter
    and the guides no longer say to run `/plugin install`.

## [0.4.0] - 2026-11-25

### Breaking changes

- **roux's server is Go.** The Spring Boot runtime (the Maven modules, the BOM and the archetype)
  is gone; `github.com/jwcarman/roux` is a Go module at the repository root, its endpoints under
  `/api/roux`. `@jwcarman/roux-web` keeps its name and talks to the Go server. A new app starts with
  `npm create @jwcarman/roux-app <name>` (Go and React; Go 1.27, Node 20 or later). An app built on
  0.3.0 or earlier stays on the Java line: there is no migration path, and its Maven artifacts remain
  on Maven Central. The guides and the Claude Code skill describe the Go runtime only.

### Security

- **`github.com/klauspost/compress` is v1.20.2** (from v1.19.1), in roux, the template and Roux The
  Day: v1.19.1 can panic on malformed compressed input (GO-2026-6865), reachable through the
  Prometheus metrics handler. CI now runs `govulncheck` on roux and the template, and the repository
  has CodeQL scanning and Dependabot security updates.
- **`github.com/go-jose/go-jose/v4` is v4.1.6** (from v4.1.4; Dependabot's high and medium
  advisories), in roux, the template and Roux The Day.
- **`qs` 6.17.1 and `minimatch` 11.0.1** through npm `overrides` in roux-web's workspace, the
  template's front end and Roux The Day's: both come in only through Stryker, which pins the
  vulnerable lines. Development tools only; nothing in an app's bundle changes.

### Added

- **The mail server is checked at startup,** in the background so startup never waits on it: roux
  connects, secures the connection and signs in, sending nothing, and logs `mail server ready` or an
  ERROR naming the cause (`emaillink.SMTPSender.Check`). An `SMTP_ADDR` that is not `host:port`, or a
  `MAIL_FROM` that is not an address, stops startup. An email that fails to send is now logged as an
  ERROR, not a WARN: nobody can sign in until it is fixed. The email module now drains at shutdown,
  so a sign-in email accepted a moment before still goes out.

- **`make up` runs the app in Docker as a deployment does:** the image built from the Dockerfile,
  beside Postgres and Mailpit (a new `app` service in `compose.yaml`, under the `app` profile);
  `make down` stops it. CI builds the template's image and runs that stack, checking that a sign-in
  email arrives (`scripts/check-image.sh`).

- **`npm run lint`, `format` and `format:check` install `frontend/lint-tools` when it is missing,**
  instead of failing with "No such file or directory".

- **The users module mounts first,** whatever the order of the module list, so
  `k.Organization()` and `k.ShellTheme` are the app's own settings in every module's `Mount` and
  `Start`, not UTC and `en-US`. The guides and the skill no longer warn about module order.

- **An app can reword any of roux's emails** (`authn/emaillink`): each email is now a pair of Go
  templates (`<name>.txt` with its subject, `<name>.html` in a shared `layout.html`), and a file of
  the same name in the app's `cmd/server/emails/` replaces roux's. `app.EmailLinkFromEnv(appName,
  emails)` takes the folder (`emaillink.Config.Templates`); the template embeds it, with a README
  naming each email and its values. Every email renders once at startup: a misnamed file, a missing
  subject or body, or an unknown value stops the server naming the file. roux's own emails read and
  look exactly as before.

- **`make dev` runs an app**, in the template and Roux The Day: PostgreSQL and Mailpit, the front
  end built once, and the server at `http://localhost:8080` with development settings (a
  development `CODE_SECRET`, the compose database, `owner@example.com` as the first owner), each of
  which gives way to the environment. `create-roux-app`, the guides and the skill all say `make dev`.
- **`make e2e` runs the Playwright suite** (`e2e/run.sh`) against a fresh copy of the app on port
  8099 with its own database, leaving `make dev`'s data alone. The template's suite was still
  written for the Java build and failed at once; both apps' suites pass against the Go server.
- **`SMTP_USERNAME` and `SMTP_PASSWORD`,** the mail server's login (both or neither), so SendGrid,
  SES and the like work.
- **One line says the app is up:** `Team Planner is up at http://localhost:8080`, with the roux
  it was built with (`roux=v0.4.0`, or `local (../)` against a checkout), Go's version and the
  address. It replaces `listening`.
- **`PASSKEYS`** (`true` or `false`, default `true`) turns passkeys off.
- **The template's front end has Prettier and ESLint** (`npm run format`, `format:check`, `lint`),
  with roux-web's settings, in `frontend/lint-tools/`; CI checks both. The skill's `check.sh` runs
  them, writing Prettier's fixes as it does gofmt's.
  Roux The Day has the same. ESLint now refuses a second import from one module
  (`no-duplicate-imports`), in roux-web too.
- **A container image for every app.** The template has a `Dockerfile` (the front end built, then
  embedded in a static server on distroless `nonroot`: no shell, not root, about 46 MB), a
  `.dockerignore` and `make image`; a test keeps the build stages on pinned releases and the server
  on distroless as nonroot.
- **`pgdb.Rollback(ctx, tx)`,** to defer after `Begin`: it undoes a transaction that was not
  committed and logs a rollback that fails, so a deferred rollback needs no ignored error.
- **Light and dark mode in roux-web.** `ColorModeProvider`, `ColorModeButton` and
  `ColorModeSwitch` (for the account menu) are in `@jwcarman/roux-web/theme`; `next-themes` is a
  peer dependency, which a template-made app already has. The template's `shell/colorMode.tsx` is
  gone.
- **`signedInAs(permissions)` in `@jwcarman/roux-web/testing`:** the server's answers to the
  session's two requests for `TEST_USER` holding the permissions, or for nobody (`null`). The
  template's `renderRoute` uses it.
- **`@jwcarman/roux-web/users`: the users API client.** roux's server shapes (`User`,
  `UserDetail`, with `email` and `role` nullable as the server sends them), its rules
  (`invitationSchema`, `renameSchema`), `usersApi`, the queries (`userQuery`, `usersPage`,
  `userActivitiesPage`, `invitableRolesQuery`) and mutations (`inviteUser`, `changeUserStatus`,
  `renameMe`), with their keys in `userKeys` under `["roux", ...]`. The template's pages and forms
  stay the app's own and use it; its `users.ts` keeps only the role labels (`roleLabel`), and
  `api.ts` and the users and roles keys are gone. An app made before this can do the same.
- **The front end's permissions generated from the server's, and the grants checked.**
  `rouxtest.PermissionsFile(t, path, permissions...)` writes `frontend/src/permissions.gen.ts`
  (a constant per permission, and `PERMISSIONS`), failing once when it was stale so the change
  is committed; `rouxtest.CheckGrants(t, db, permissions...)` fails when OWNER lacks one or a role
  is granted one nobody declares. `app.RouxPermissions()` is roux's own. The template's
  `cmd/server/permissions_test.go` runs both over every migration the app runs; an app lists
  its permissions in `permissions()` in `modules.go`, roux's then its own.
- **Active members by id, for a feature that refers to people.** `users.MustBeActive(ctx, db,
  field, ids)` refuses ids that are not active members (400 on the field, "Must be active members
  of the team"); `users.Members(ctx, db, ids)` names them, by name, with whether each is still
  active.
- **`rouxtest`, for an application's own tests.** `rouxtest.New(t, schema, migrations...)` is
  the app's features over a fresh schema with roux's tables; `Role(name, permissions...)`,
  `Person(name, role)`, `Deactivate`, `At(moment)`, `Migrate` and `Kit()` (to mount the app's
  routes) on top of authntest's signed-in browsers.
- **A paginator for a table or view, as jpa-utils' in Java.** `page.New(page.ListConfig{From,
  Columns, Sorts, DefaultSort, Search, Scan})` declares a list once; `Check` runs its queries at
  startup so a misspelled column fails there; `Page(ctx, db, req, search, filters...)` returns a
  page with the count, the search (`page.Contains`, `Prefix`, `Exact`, every word in some field),
  ORDER BY with `id` as the tiebreaker, LIMIT and OFFSET. Filters are `page.Where("day < ?",
  today)` and `page.WhereIf(cond, ...)`: SQL text is a constant, values are always arguments.
- **An app's whole `main` in one call.** `app.Main(app.Config{Name, DisplayName, Frontend,
  Modules})` sets up logging and telemetry, the health probes, the database, the modules, the
  front end and a bounded server, and shuts down gracefully; `app.Run(ctx, cfg)` is the same
  without the signals and the exit. The template's `main.go` is that one call: an app made before
  this can replace its `run` with it, keeping `modules`.
- **Guarded routes in one call.** `kit.Handle(pattern, permission, fn)` mounts an application
  route behind the CSRF check, a sign-in and the permission, so no route is mounted half
  guarded; an empty permission panics at startup. `kit.HandleSignedIn` is for anyone signed in,
  `kit.HandlePublic` for anybody. `Mux.Handle` still mounts a route as it is, but startup logs
  a warning naming each one (`Mux.Unguarded`); `Mux.HandleGuarded` is for a handler that guards
  itself.
- **Sessions have a lifetime.** `authn.Config.SessionLifetime` (default 12 hours) ends a session
  however busy it is, so a stolen cookie kept warm still dies. `authn.EndSessions` ends an
  identity's sessions inside a transaction.

- **"An email address was added" email.** Confirming a new address emails every address already
  on the account, with the new one masked, as replacing one does: an added address is a way in.
- **"An API key was made" email.** Making or rotating a key emails the owner
  (`apikey.Config.Notify`, wired to `emaillink.Method.APIKeyMade` by `app.APIKeysFromEnv`), as
  adding a passkey does.

- **`app.Server`**: the HTTP server with every connection bounded (headers 10 s, request 30 s,
  answer 60 s, idle 120 s) and, over HTTPS, HSTS for a year. The template's `main` uses it: an
  app made before this sets only `ReadHeaderTimeout`, so change its `http.Server` to
  `app.Server(addr, handler, secure)`.

### Changed

- **`CODE_SECRET` is checked at startup.** A secret weaker than about 128 bits (its length times
  log2 of the character kinds it uses) logs a warning naming `openssl rand -base64 32`. The
  development secret `make dev` sets is not warned about, but the server refuses to start with it
  when `PUBLIC_URL` starts with `https://`, a real deployment.

- **The startup lines for sign-in with a provider and for bearer tokens, when off, say what the
  feature is and how to turn it on** (`OIDC_PROVIDERS_FILE`; `JWT_ISSUER` and `JWT_AUDIENCES`),
  not just which setting is missing.

- **Breaking: a setting roux cannot use stops startup.** Before, each of these started an app in
  which nobody could sign in, with at most a line in the log:
  - without `CODE_SECRET`, sign-in and everything built on it were off; it is now required;
  - without `DATABASE_URL`, the pages were served alone; a module with tables now refuses to start
    without it;
  - with no one able to manage the team and no `OWNER_EMAIL`, nobody could ever get in; that now
    stops startup, saying to set `OWNER_EMAIL` and `OWNER_NAME`.
  `app.EmailLinkFromEnv` no longer returns nil, and the template's `modules()` lost its two early
  returns.
- **Breaking: booleans are `true` or `false`, and durations have a unit.** `API_KEYS=false` turns
  API keys off (`off` was the only word that did, so `API_KEYS=false` left them on);
  `SMTP_ALLOW_PLAINTEXT` and `TRACE_TRUST_INBOUND` refuse `TRUE`, `1` or `yes` instead of reading
  them as false; and `SHUTDOWN_DELAY=30` is refused instead of meaning no delay.
- **Breaking: passkeys follow `PUBLIC_URL`** and are on by default. The relying party is
  `PUBLIC_URL`'s host and its address is allowed, so `http://localhost:8080` works in development
  with no setting; before, the default origin was `https://<rp id>`, which development never
  matched. `PASSKEY_RP_ID` now only names a parent domain, and `PASSKEY_ORIGINS` adds origins.
- **Breaking: `permissions()` is `slices.Concat(app.RouxPermissions(), labels.Permissions, ...)`.**
  The guides showed `append(..., labels.Permissions...)` with "one more `...` per feature", which
  does not compile for a second feature: Go takes one spread per `append`.
- **A route's permission must be one some role holds.** `kit.Handle("GET /api/items",
  "items.raed", ...)` used to mount a route that answered `403` to everyone; startup now stops,
  naming the route and the permission.
- **Breaking: an API path is always relative to the API.** `getJson("/items")` used to call
  `/items`, outside the API, where the page answered HTML and the call failed as bad JSON. A path
  starting with `/` now throws, naming the path to write (`"items"`); roux's own endpoints are
  `"roux/..."`, and `ORGANIZATION_PATH` is `"roux/organization"`.
- **A form field's schema must be one of roux's rules.** A field whose schema was plain Zod
  (`z.string()`), or a rule behind `.transform`, showed no required indicator and no `maxLength`,
  without a sign; it now throws when it renders, naming the field and the fix. A checkbox's
  `z.boolean()` is the exception.
- **Breaking: the `apperr` package is gone.** Its sentinels (`ErrNotFound`, `ErrConflict`, ...)
  were a second way to answer a refusal, beside `problem`, and answered a bare `Not found`. Return
  `problem.NotFound("No such item")` and its siblings.
- **Breaking: roux-web's test helper `invariantViolation` is `badRequest`,** the name of what it
  stands for on the server (`problem.BadRequest`).
- **The browser's `Problem` keeps `code` and `traceId`,** which the server sends and `problemOf`
  used to drop.
- **Comments and messages name roux, not its Java ancestors:** no more `who`, Spring or
  `roux.money.currency` (the money error now says to set `ORG_CURRENCY`); sign-in's errors say
  "the server answered". `feature.md`'s steps are numbered in reading order.
- **Breaking: a list's row struct is its select list.** `page.ListConfig` loses `Columns` and
  `Scan`: each field of the row names its column with a `db` tag, and pgx fills the row by name, so
  there is no scan code to keep in step. A field without a tag, or a tag that is not a plain column
  name, makes `page.New` panic, naming the field and the tag to write. A value in another form
  than the database keeps it (a date as `2026-11-24`) is the view's work (`to_char`).
- **`emaillink.Method.EnsureIdentity` is one transaction:** the identity and its address commit
  together, so a failure between them can no longer leave an identity nobody can sign in as.
- **SMTP on port 465 speaks TLS from the first byte** (implicit TLS, RFC 8314); any other port
  is upgraded with STARTTLS, as before. The email guide's new "Sending for real" shows an email
  service (Postmark, SendGrid, SES and the like) set up through its SMTP endpoint.
- **A client that went away is no error:** a handler that returns its request's cancellation after
  the client left (a page left mid-request) answers 499 (`api.StatusClientClosedRequest`) and logs
  at DEBUG, instead of a 500 logged as an unhandled ERROR. A cancellation while the client still
  waits is still a 500.
- **Rows are read by name everywhere:** the feature recipe's `Label`, `users.Member` and the
  guides' examples tag each field with its column and use `pgx.RowToStructByName`; no list of
  columns has to match a struct's field order.
- **Breaking: `list.Check` belongs in the list's test,** not in a module's `Start`; the test reaches
  the list through an `export_test.go`. Roux The Day's items module has no `Start` any more.
- **The users list is a `page.New` list:** its sorts are logical names mapped to their SQL, and its
  search is `page.Contains` on name and email.
- **Breaking: roux-web's human check is gone** (`HumanCheckOptions`, `HumanCheckFailed`, the
  `Who-Human-Check` header): no server ever read it. `auth.email.send` takes only the address.
- **Sign-in refusals are logged at Info:** an unknown address, a wrong or used code, a deactivated
  person. They were at Debug, so a sign-in that silently did nothing left no trace at the default
  level.
- **The Keycloak realm file is `deploy/keycloak/realm.json`.** `create-roux-app` renamed `roux-app`
  inside `compose.yaml` but not the file's name, so the `oidc` profile mounted a missing file. The
  template export now refuses a file whose name says `roux-app`.
- **Releases are tagged `v0.4.0`**, as the Go module proxy requires (npm still gets `0.4.0`). The
  release workflow no longer deploys to Maven Central: it checks the tag and the changelog, builds
  the module, asks the Go module proxy for the release, publishes roux-web, then bundles the starter
  with its `go.sum` and lock resolved against the published release and builds it before
  publishing. The template's export and the packed starter are tested in CI again.
- **`create-roux-app` makes a Go app**: no Maven wrapper; it calls the directory the app's Go module,
  prints the Go way to start the app, and takes `${` in a name (it was a Spring placeholder).

- **The Appearance page offers all five shapes at once** (square, slightly rounded, rounded, very
  rounded, extra rounded): "More options" no longer hides two of them.

- **The template's development services stay on this machine.** `compose.yaml` publishes every
  port on 127.0.0.1 only and pins each image to a release (Postgres 17.6, Mailpit v1.34.0,
  Keycloak 26.0.8, otel-lgtm 0.41.1, the collector 0.165.0); a test in `cmd/server` reads the file
  as YAML and keeps it so, whichever way a port is written.
- **Plain HTTP for a real host must be on purpose.** A `PUBLIC_URL` of `http://` for a host other
  than this machine stops startup, saying to serve over HTTPS, unless `COOKIE_SECURE=false` says
  so; then a warning is logged. Localhost is unaffected.
- **A client's trace is linked, not joined.** `telemetry.HTTP` starts each request's own trace,
  linked to any `traceparent` the client sent, and takes in no client baggage: anyone may send
  those headers. Behind a gateway that starts the traces, `TRACE_TRUST_INBOUND=true` continues
  them as before.
- **API answers are `nosniff` and `no-store`** unless their handler sets its own caching, and a
  static file opened on its own (a stray `.html` or `.svg`) is sandboxed by its own CSP (a script is not, so it can run as a worker).
- **Managing users reaches only the people beneath you.** Every change to a person (role,
  deactivate, reactivate, rename, sign out everywhere) needs, for an owner, `users.owners` and a
  recent sign-in, as making an owner does; for anyone else, every permission they hold. Otherwise
  it is a 403. Inviting someone or changing a role refuses a role holding a permission the caller does
  not (400 on `role`), so granting `users.manage` or `users.invite` to a lesser role cannot
  escalate.
- **A bearer token needs a recent sign-in to make or rotate an API key,** as a browser does: the
  token's `auth_time`. A leaked access token could otherwise turn itself into a key lasting a year. An
  `auth_time` later than the token's issue time (beyond a minute's skew) is not believed.
- **Deactivating someone ends their sessions at once,** not at their next request: reactivated
  before then, they used to come back signed in.
- **Dead sessions are cleared.** A sign-in deletes sessions that ended, idled out or outlived
  their lifetime more than 30 days ago.

### Fixed

- **The address confirmation email showed `%!(EXTRA string=...)`** after its first sentence and
  on its button: a format string with no place for the app's name. It reads cleanly now.

- The Dockerfiles install the front end with `npm ci --ignore-scripts`: no package's install script
  runs in the image build.
- `app.Run`'s shutdown keeps the context's values (`context.WithoutCancel`) instead of starting from
  `context.Background()`.
- A JWT test minted its tokens' `iat` from the real clock and `auth_time` from the test's clock,
  so it failed once the real date passed the test's.
- **A huge `pageIndex` is an empty page,** not a 500: the offset stops at Postgres's limit
  instead of overflowing negative.
- **Error answers name no Go types.** A body that does not decode says what is wrong in the
  client's terms ("item has the wrong type", "a member this endpoint does not take: x", 413 for
  over 1 MiB), and an `apperr` sentinel answers with its own words only, not the context it was
  wrapped with.

### Documentation

- **The skill's lists card is built by CI.** Its server side is now the paged list of the recipe's
  `labels` feature, and `check-recipe.sh` builds and tests it with the recipe, so what it shows
  compiles and passes.

- **The guides describe the Go server.** Every guide's server half is rewritten for Go: making an
  app (`app.Main`, its modules and every environment variable), a feature's server side (now
  `features.md`, in place of `entities.md`: migrations, the module, the input, the service, the
  handlers and the test, from an example built and tested in a copy of the template), errors as
  `*problem.Problem`, permissions and the permissions tests, users, paging with `page.New`, money,
  dates, the activity log, email and `rouxtest`. The browser halves name the Go server's paths
  (`/api/roux/...`) and roux-web's own sign-in client.
- **A docs site**, built with MkDocs Material and published to GitHub Pages
  (<https://jwcarman.github.io/roux/>), with `llms.txt` and `llms-full.txt` for coding agents and
  a page on the Agent Skill.
- **Every guide and the skill's cards use Roux The Day's domain** (items, labels, contacts, a
  person's profile) in place of the dojo's students, ranks, coaches and classes; a new app's
  example name is `team-planner`. The README and the docs' home page say roux is written for agents.
- **The recipe and the features guide build `labels`** (a name and a colour, for tagging a team
  planner's items) instead of the dojo's ranks; the recipe check now lints the recipe's front end.
- The docs' home page and the README show roux's mark.
- **The Agent Skill is rewritten for the Go server.** Its recipe builds a feature end to end (the
  migration, module, input, service, handlers and Go test, then the browser's module, dialog, page,
  route and tests), every block copied from code CI builds into the template and checks.
  `scripts/check.sh` runs an app's checks in the order the build needs (gofmt, the permissions
  file, vet, golangci-lint, the Go tests when a database is reachable, the frontend's tests and
  build) and names what it skipped. The cards (errors, forms, lists, permissions, users, tests, app
  setup, money, dates, the activity log, email) name the Go API. CI checks that every public name,
  Go and TypeScript, is in the guides and the skill, and that every Go name they write exists.
- **`@jwcarman/roux-web/auth` and `@jwcarman/roux-web/users` are documented** (The shell, Users),
  as are colour mode's `ColorModeProvider`, `ColorModeButton` and `ColorModeSwitch`.

## [0.3.0] - 2026-11-24

Upgrading from 0.2.0: read **Breaking changes** first. Each entry says what a roux app changes.

### Breaking changes

- **who 0.26.0 (was 0.15.0), brought by the starter.** `roux-spring-boot-starter` brings
  `who-spring-boot-starter`, both sign-in methods (`who-email-link`, email links and typed codes, and
  `who-passkey`), `who-admin` and `who-email`: drop your own who dependencies, or keep them without a
  version. `@jwcarman/who-client` is 0.25.0. Read who's
  [upgrading guide](https://github.com/jwcarman/who/blob/0.26.0/docs/guides/upgrading.md) for the
  full list. What changes for a roux app:
  - Sign-in needs its settings, or startup fails: `who.email-link.link-base-url`,
    `who.email-link.code-secret`, a way to send email, and `who.passkey.rp-id`.
  - who's endpoints are under `/who` and REST-shaped, with no aliases: `/ott/generate` is
    `/who/email/send`, `/logout` is `/who/logout`, and the person's own things are under `/who/me`
    (`/who/me/sessions`, `/who/me/passkeys`, `/who/me/email-addresses`, `/who/me/accounts`,
    `/who/me/api-keys`; a passkey is registered with `POST /who/me/passkeys/options` then
    `POST /who/me/passkeys`). `@jwcarman/who-client` has the account calls under `client.me.*`.
  - `/who/me` and the admin endpoints are Spring MVC controllers: the app's `authorizeHttpRequests`
    rules apply to them (never deny `/who/**`), and an app controller on their paths, a path prefix
    or `spring.mvc.servlet.path` that moves them fails startup. An app with no `SecurityFilterChain`
    of its own gets who's.
  - Under `/who`, who answers every error itself as Problem Details (`type` `urn:who:error:<code>`,
    `title`, `status`, `detail`, `code`); `invalid-request` replaces `invalid-admin-request`,
    `invalid-api-key-request` and `invalid-invitation`. `WhoProblemsAdvice` answers only who's
    exceptions on the app's own endpoints (sign-in failed, reauthentication required).
  - Email: `who-email` renders who's emails and roux-email finishes them (see Added). SMTP delivery
    stays the app's choice: add `who-email-smtp` beside `spring-boot-starter-mail`, or write a
    `WhoEmailSender`, which now only delivers a rendered `OutgoingEmail` (`to`, `subject`, `text`,
    `html` or null, `source`). `EmailLinkSender` is `WhoEmailSender`; `MailWhoEmailSender` is
    `SmtpWhoEmailSender`; `WhoEmailTemplates` is `WhoEmailTemplatesContributor`. `who.email.from`
    replaces `who.email-link.from` and `who.passkey.from`; subjects are message keys
    (`who.email.<template>.subject`).
  - Libraries' tables are created by [migratory](https://github.com/jwcarman/migratory) 0.1.0, which
    who brings, before the app's changelog. Remove the include of who's changelog
    (`classpath:org/jwcarman/who/db/who-changelog.xml`) from the master changelog, and the
    `who.initialize-schema` setting; paths are unchanged, so an existing database runs nothing again.
    who adds a `who_session` table. `spring.liquibase.enabled=false` turns off only the app's
    changelog and `migratory.enabled=false` the libraries' (the app then includes their changelogs),
    so a test profile that kept Liquibase off the database sets both. `spring.liquibase.drop-first`
    fails startup; `migratory.drop-first=true` rebuilds a development database instead.
  - A passkey label is 1 to 64 characters, not blank, with no control characters.
- **Roles and permissions** (`docs/guides/roles.md`):
  - Set `roux.owner.email` and `roux.owner.name` (both required; startup fails naming the missing
    one). While no active identity holds `OWNER`, roux creates one at startup. Delete the app's own
    owner bootstrap.
  - Set `roux.roles.invitable` to the roles an invitation may give. It is empty by default, so every
    invitation is refused until it is set; `OWNER` may not be listed.
  - The app's roles move to a Liquibase changeset that creates them and grants their permissions by
    name (`ON CONFLICT DO NOTHING`), and grants `OWNER` the app's own permissions. Remove startup
    code that creates or syncs roles.
  - Deactivating someone or removing a role goes through who-admin's `LastAdminGuard`, which refuses
    to leave no active identity that may manage people (only `OWNER`, by default). roux answers
    `LastAdminException` as a `409` with code `last-admin`.
- **Users** (`docs/guides/users.md`): roux-users, in the starter, keeps each user's name and serves
  the users endpoints (see Added). Delete the app's own profile table, user directory, invite endpoint
  and actor names; move each profile's name into `roux_user` in a changeset; grant `users.*` to the
  app's roles and list `RouxUserPermissions` in its roles test.
- **The organization's time zone and locale** (`docs/guides/dates-and-time.md`):
  - Set `roux.organization.time-zone` (an IANA zone, `America/New_York`) and
    `roux.organization.locale` (a BCP 47 tag, `en-US`). Both are required; startup fails naming a
    missing or unknown one, a fixed offset (`+05:00`, `UTC+3`) for the zone, or a tag written another
    way (`en-us`).
  - In `main.tsx`, `await loadOrganization()` and `startDayWatch(queryClient)` before `render`; in the
    Vitest setup, `beforeEach(() => setOrganization(testOrganization()))`.
- **roux serves the app's shell** (roux-spa, in the starter). `static/index.html` must carry the four
  placeholders `__CSP_NONCE__`, `__APP_THEME__`, `__APP_NAME__` and, after `#app-theme`,
  `<script type="application/json" id="app-context">__APP_CONTEXT__</script>`; a page without them
  fails startup. Delete the app's own shell controller, its header writer, and any page paths listed
  in `who.security.public-paths`: roux answers every page URL with the shell, nonce and
  Content-Security-Policy included (see Added).
- **roux-web's list components take the resource module's query**, not a key plus a fetch function.
  `pageQuery(queryKey, (params, signal) => ...)` now builds it and returns a `PageQuery<T>` (`queryKey`
  and `fetch`); the old `pageQuery(params)`, a URL query string for an export link, is
  `queryStringOf(params)`. `QueryTable` and `useQueryTable` take `query: PageQuery<T>` (replacing
  `queryKey` and `query`), `InfiniteList` takes it in place of `queryKey` and `fetchPage`, and
  `InfiniteSelect` in place of `queryKey` and `queryFn` (`InfiniteSelectQuery` is gone; its
  parameters are `PageParams`). `SimpleQueryTable` takes `query` as the list's TanStack query options
  (pass the module's `queryOptions(...)`). Every page fetch receives the `AbortSignal`, so a page no
  longer needed is cancelled.
- **roux-web has new peer dependencies:** `date-fns` `^4.4.0`, `@tanstack/react-router`
  `^1.170.46`, `@jwcarman/who-client` `^0.25.0`, `culori` `^4.0.2`, `@emotion/cache` `^11.14.0`, and
  the fonts `@fontsource-variable/inter`, `lora` and `nunito` `^5.3.0`. The browser test kit's
  (`vitest`, `msw`, `@testing-library/react`, `@testing-library/jest-dom`) are optional.
- **`NotFoundException` takes a format pattern and its arguments**, as `ConflictException`,
  `InvariantViolationException` and `InvalidFieldException` do: `new NotFoundException("No student %s",
  id)`. A call with a plain message compiles and reads as before; code compiled against 0.2.0 must be
  recompiled.

### Added

- **`npm create @jwcarman/roux-app acme-gym` starts a new app** (`@jwcarman/create-roux-app`): roux's
  app template at the same release, named after its directory (or `--name "Acme Gym"`), with a Maven
  wrapper and a first commit. Its roles test is `PermissionsTest` (the grants, on the database) and
  `PermissionsListTest` (writes `permissions.gen.ts` without Docker), both reading
  `PermissionClasses.ALL`. `docs/guides/getting-started.md` opens with "Start a new app".
- roux's features are modules of their own, each switched on by its jar (the auto-configuration stays
  in roux-autoconfigure). The starter and roux-bom carry them all, except `roux-theme` and `roux-test`,
  which an app adds itself:
  - `roux-validation`: `@Phone` (the browser's `phone()` rule, the same pattern `Phone.PATTERN` and
    message, held to the same examples by `contracts/phone.json`), `@NotInFuture` for a `LocalDate`
    (`Must not be in the future`, against the organization's today) and class-level
    `@After(field, other, otherLabel)` (`Must be after {other}` on the later field; `LocalTime`,
    `LocalDate`, `Instant`, numbers, any `Comparable`), with roux's validation messages.
  - `roux-jpa`: `Versions.require(entity, request.version())`, the stale-version check every edit
    makes (no version is a field error on `version`, an old one the 409). `IdentityAuditor`,
    registered for you, records the signed-in identity's id (or `"system"`, or
    `roux.auditing.system-auditor`) in `@CreatedBy` and `@LastModifiedBy`, so an app writes a plain
    `@EnableJpaAuditing`; an `AuditorAware` of its own is kept. `@CreatedDate` and
    `@LastModifiedDate` come from the app's `Clock` bean (`ClockDateTimeProvider`).
    `Idempotent.insert(entityManager, key, exists, insert)` takes a transaction-scoped PostgreSQL
    advisory lock on the key, then checks and inserts, so a race never meets the unique constraint.
  - `roux-spa`: the app's shell for any page URL, so a route is written once, in the frontend. A GET
    or HEAD that accepts `text/html`, has no file extension and is not under `/api`, `/who`,
    `/assets`, `/actuator`, `/.well-known` or `/error` (or `roux.spa.excluded-paths`) gets
    `index.html` with the request's nonce, the theme and the app's name, `Cache-Control: no-store`
    and a strict Content-Security-Policy, extended only by `roux.spa.csp.*` properties (a wildcard or
    an unsafe keyword stops startup). `/assets/**` is cached for a year, and `/index.html` and
    `/assets/**` are who's public paths. The theme comes from a `ShellThemeSource` bean or the
    `roux.theme.*` properties.
  - `roux-organization`: `OrganizationCalendar` (`today()`, `thisMonth()`, `now()`, `todayEndsAt()`,
    `zone()`, `locale()`, from the app's `Clock` in the organization's zone), `OrganizationContext`,
    and `GET /api/organization`. The shell writes the context into the page (`#app-context`).
  - `roux-roles`: `RouxRoles.OWNER`, created by its changelog with who-admin's permissions; the first
    owner; `UserInvitations` (invite by name, with the app's own writes in the invitation's
    transaction, and `resend(identityId)`); invitable roles and `GET /api/roles/invitable`;
    `CallerPermissions` (`has`, `require`) for the parts of a response only some callers see;
    `Permissions.allOf`; and for an app's roles test, `RoleGrantsCheck` and `PermissionsTypeScript`
    (writes and checks the frontend's `permissions.gen.ts`). roux publishes `UserJoined`, with the
    user's role, for the first owner and every invited user.
  - `roux-users`: each user's display name (`AppUser`, table `roux_user`), the read-only directory
    (`UserDirectory`, `UserFilter`, `UserSort`), and `/api/users` (`GET`/`PUT /me`, list, detail,
    history, invite, resend an invitation, rename, change role, deactivate, reactivate, sign out
    everywhere, make an existing user an owner after a recent sign-in), behind `users.read`,
    `users.invite`, `users.manage` and `users.owners` (`RouxUserPermissions`), granted to `OWNER`.
    Each change is an activity, and the activity log names actors after their `AppUser`.
  - `roux-activity-log`: a record's business history. A kind is a record implementing
    `BusinessActivity`; `ActivityLog.append(anchor, activity, related...)` stores it in the change's
    transaction with the actor and time (table `roux_activity`), `ActivityLog.history(id, page)` reads
    it, and an `ActorNames` bean names actors. See `docs/guides/activity-log.md`.
  - `roux-money`: `Money(minorUnits, currency)`, an `@Embeddable` record (`times`, `plus`,
    `isPositive`, `format(Locale)`) sent as `{ "minorUnits": 15000, "currency": "USD" }`;
    `@InCurrency`, `@PositiveMoney` and `@PositiveOrZeroMoney`; with `roux.money.currency` set, the
    `MoneySettings` bean and the currency in the organization's context. See `docs/guides/money.md`.
  - `roux-email`: who's five emails (sign-in, invitation, address confirmation, address changed,
    passkey added) finished: named after the app, as plain text and as one HTML card in the brand
    colour. An app replaces one email, or one subject, with its own (`docs/guides/email.md`).
  - `roux-theme` (not in the starter: add it beside the starter, as a new app does): the owner's theme
    in roux's table `roux_theme`. `GET /api/theme` (open, for the signed-out shell) and
    `PUT /api/theme` (`theme.manage`, granted to `OWNER`; a stale `version` is a 409). Each part the
    owner has not chosen is its `roux.theme.*` property.
  - `roux-test` (add it with test scope): the Java test kit. `@AppTest` (the whole app on PostgreSQL,
    a database per context), `TestUsers` (`reset()` empties every table that was empty at startup;
    `signedIn(name, email, role)`, `owner()`, `anonymous()`), `TestUser`, `TestClock`, `TestDatabase`,
    `RecordingWhoEmailSender` and `TestMail`. Servers from `ROUX_TEST_DATABASE_*` and
    `ROUX_TEST_MAIL_*`. See `docs/guides/testing.md`.
- roux-web:
  - `/session`: `SessionProvider` and `useSession()` (the caller, their `Profile`, `refresh`,
    `refreshProfile`, `signOut`, `currentMe`; the query cache emptied when the person changes) and
    the route guards `requireSignedIn`, `requireSignedOut` and `requirePermission`.
  - `/signin`: `EmailSignIn` (a link, or the code from the email), `PasskeySignInButton`,
    `ProviderSignInButtons` / `ProviderSignInButton` (drawn as each provider's guidance asks),
    `EmailLinkLanding`, `useSignInReturn` with `rememberSignInReturn`, and `PasskeySettings` (the
    person's passkeys, with `passkeyLabelError` and `PASSKEY_LABEL_MAX`).
  - `/navigation`: `defineNav(permissions, items)`, typed against the router's routes and the app's
    permissions (and checked when the module loads), `navItemsFor`, `startPathFor`,
    `openingRedirect`, `AppShell` and `NavLinks`.
  - `/theme`: `ThemeProvider` (Chakra with the page's theme, the bundled font and the CSP nonce),
    `useShellTheme`, `createThemeSystem` and `<AppearanceSettings />` (the owner's form, with live
    preview and Undo).
  - `/organization` (`loadOrganization`, `today`, `useToday`, `startDayWatch`, `setOrganization`,
    `testOrganization`, ...) and `/dates` (`formatDate`, `formatTime`, `formatDateTime`,
    `formatNumber`, `formatInstantDate`, `formatRelativeTime` in the organization's locale and zone;
    `parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime`).
  - `/money` (`Money`, `formatMoney`, `timesMoney`, `currencySymbol`, `digitsOf`,
    `organizationCurrency`), and in `/form` the `money()` rule, `f.MoneyField` and `moneyInputOf`:
    amounts are parsed without floating point, held to the server's rules by `contracts/money.json`.
  - `/activity`: `Activity`, `ActivityList`, `historyQuery`.
  - `/testing`: the browser test kit (`server`, `listen`, `checkAllAnswered`, `settle`,
    `testQueryClient`, `renderWithProviders`, `renderHookWithProviders`, the problem answers
    `invalidFields`, `invariantViolation`, `notFound`, `stale`, `serverError`, and `pageOf`), with
    `/testing/setup` for the app's setup file.
  - `/api`: `optimisticMutation(key, options)`, `useOptimisticValue` and `useOptimisticToggle`, for a
    control that saves on change and shows it at once; a refusal toasts and falls back.
  - `/form`: `id()` (a required select over ids loaded at run time), `oneOf(values).optional()` and
    `id().optional()` (`ChoiceRule`), `after(schema, { field, other, otherLabel })` (the same words as
    `@After`, `contracts/after.json`), and `time()` with `timeInputOf` (`HH:mm` or `HH:mm:ss`,
    `contracts/time.json`).
  - `/paging`: `idSearchOf` and `dateSearchOf`, beside `enumSearchOf`.
  - `PageHeader` (a page's title and actions), and `FilterChips`' `defaultValue` (the chip shown
    chosen while the URL has none).

### Changed

- roux-problems answers a JSON body's enum value outside its set (`"role": "OWNER"`) as a field error
  on that field, `Must be one of MEMBER, INSTRUCTOR` (`items[1].role` inside a list), and a date, time
  or instant it cannot read as `Is not in the expected format`. Both were the generic 400.
- `phone()` is one pattern, `^(?=(?:\D*\d){7})[\d +\-().]+$`: only spaces (not tabs or other
  whitespace) between digits, as its description always said.

### Fixed

- roux-web's `DebouncedSearchInput` reports its pending term when the field loses focus, and at once
  when cleared, so a link clicked within the debounce no longer loses to the late search.

### Requirements

- Spring Boot 4.1.3 (was 4.1.2), who 0.26.0 (was 0.15.0), migratory 0.1.0, jpa-utils 0.2.0.

## [0.2.0] - 2026-11-14

Forms that are easy to write: Zod schemas with the server's wording, mutations declared once per
endpoint, and `useSchemaForm` doing the rest.

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
  handles refusals. A save always carries the mutation (so the version) its draft started from, even
  when a refetch brought a newer record meanwhile, so it cannot quietly undo whoever saved first: the
  server answers 409. A 409 starts the form over from the caller's record when it differs from the
  one the draft started from; a 409 that changes nothing the form shows (a duplicate on create, or a
  change to a field it does not show) keeps what was typed, and the next save goes at the latest version.
- Fields take `required` and `maxLength` from the schema; `SelectField` takes typed options (values
  with `labels`, or `{ value, label }` with number or boolean values).
- `/api`: `sendJson` (an answer without a body, such as a 204 or a 201 with only a `Location`,
  resolves `undefined`), `{ params, signal }` on `get` and `getJson` (`params` takes any object,
  an interface such as `PageParams` too), `PATCH`, the `path` tagged template, and `baseUrl` in
  `configureApi` (default `/api`; a path without a leading slash goes under it).
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

[Unreleased]: https://github.com/jwcarman/roux/compare/v0.6.4...HEAD
[0.6.4]: https://github.com/jwcarman/roux/releases/tag/v0.6.4
[0.6.3]: https://github.com/jwcarman/roux/releases/tag/v0.6.3
[0.6.2]: https://github.com/jwcarman/roux/releases/tag/v0.6.2
[0.6.1]: https://github.com/jwcarman/roux/releases/tag/v0.6.1
[0.6.0]: https://github.com/jwcarman/roux/releases/tag/v0.6.0
[0.5.0]: https://github.com/jwcarman/roux/releases/tag/v0.5.0
[0.4.0]: https://github.com/jwcarman/roux/releases/tag/v0.4.0
[0.3.0]: https://github.com/jwcarman/roux/releases/tag/0.3.0
[0.2.0]: https://github.com/jwcarman/roux/releases/tag/0.2.0
[0.1.0]: https://github.com/jwcarman/roux/releases/tag/0.1.0
