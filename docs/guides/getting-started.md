# Getting started

roux is the base a Go + React application is built on. The server side is a Go module,
`github.com/jwcarman/roux`: sign-in (emailed links and codes, passkeys, providers, API keys,
JWTs), roles and permissions, the users directory, errors as Problem Details, paging, money,
dates, the activity log, and the page shell. The web side is an npm package,
`@jwcarman/roux-web`, with the matching API client, paging, tables, forms and feedback. A new app
starts from roux's app template (below); the rest of this guide is what the template already does.
Either way, features use roux by importing from it; no plumbing is written in the app.

## Start a new app

1. **Make the app.** With Node 20 or later:

   ```bash
   npm create @jwcarman/roux-app team-planner
   ```

   `team-planner` is the directory, the Go module and the npm name: lowercase letters, digits and
   single dashes. The app is called "Team Planner" until the owner renames it on the Appearance page;
   pass another name with `npm create @jwcarman/roux-app team-planner -- --name "Acme Planner"`. It is
   roux's app template at the latest release (sign-in, the first owner, the sidebar frame, Users,
   Settings and Appearance), with roux from the Go module proxy and npm, and a first commit.
2. **Run it.** With Docker running and Go 1.27, in the app's directory:

   ```bash
   make dev
   ```

   That starts PostgreSQL (`localhost:5432`, user, password and database `app`) and Mailpit, which
   catches every email the app sends and shows it at <http://localhost:8025>; then runs the server
   under [air](https://github.com/air-verse/air) and Vite together, with development settings: a
   development `CODE_SECRET`, the compose database, and `owner@example.com` as the first owner.
   Open <http://localhost:5173>, the one address for everything: Vite serves the pages and passes
   `/api` to the server, and sign-in links, passkeys and cookies all name that address. Edit a page
   and it reloads; edit Go (or a migration or an email template) and air rebuilds and restarts the
   server, printing the compiler's error when the build fails. Each setting gives way to the
   environment: `OWNER_EMAIL=you@example.com make dev` makes you the owner instead. One Ctrl-C stops
   both; if either stops on its own, the other is stopped and `make dev` fails.
3. **Sign in as the owner.** On the sign-in page, ask for a link for the owner's address and open
   it from Mailpit. roux made that address the `OWNER` on the first start.
4. **Add a first page.** Ask your agent for it: roux's Claude Code plugin (the `roux` skill) says
   where each piece goes, and the app's `.claude/settings.json` names it, so Claude Code offers to
   install it when you trust the folder: accept. By hand, a feature is a Go package in
   `internal/<feature>/` listed in `cmd/server/modules.go` ([A feature](features.md)),
   and a page is a feature folder in `frontend/src/<feature>/`, a route file in
   `frontend/src/routes/_signedIn/`, and an entry in `frontend/src/shell/nav.ts`
   ([The shell](shell.md)).

`make verify` runs every check, fastest first, stopping at the first failure: the static checks
(gofmt, `go vet`, golangci-lint, Prettier, ESLint, `npm run typecheck`), then the tests (Go and
Vitest), then the release build (`make build`), then the Playwright suite (`make e2e`). It starts nothing: run
`make services` (Postgres and Mailpit in Docker) first, or give it the addresses of ones already
running, `DATABASE_URL`, `SMTP_ADDR`, `E2E_MAILPIT_URL` and `TEST_DATABASE_URL` ([Testing](testing.md#playwright)).

`make check` runs the Go checks (gofmt, `go vet`, golangci-lint, the tests; `make lint` builds the
Makefile's pinned golangci-lint into `bin/` the first time, so nothing needs installing); in `frontend/`,
`npm run format` (Prettier), `npm run lint` (ESLint, type-aware), `npm run coverage` (Vitest, 100%
of lines and branches), `npm run build` and `npm run mutate` run the browser's. ESLint and Prettier
live in `frontend/lint-tools/`, with an install of their own, which `npm run lint`, `format` and
`format:check` make when it is missing: typescript-eslint does not yet support TypeScript 7, the
app's compiler. `make build` makes the release binary, one file with the front end inside, and
`make image` the container image. `make up` runs that image as a deployment does, beside Postgres
and Mailpit (`docker compose --profile app`), at <http://localhost:8080>; `make down` stops it. Stop
`make dev` first: its server uses port 8080 too.

## Requirements

roux supports one stack and nothing else:

- Go 1.27, `net/http`'s router, pgx 5.
- PostgreSQL 17. roux runs its own migrations and the app's.
- React 19, Chakra UI v3, TanStack Router, Query, Form and Table, Zod 4.
- Go's `testing` with a real database, Vitest with MSW, and Playwright, for tests. Database tests
  start PostgreSQL in Docker, or use `TEST_DATABASE_URL`.

## The server

An app's whole `main` is one call:

```go
// Command server runs Team Planner.
package main

import (
	"github.com/jwcarman/roux/app"
	web "team-planner/frontend"
)

func main() {
	app.Main(app.Config{Name: "team-planner", DisplayName: "Team Planner", Frontend: web.Dist, Modules: modules})
}
```

`app.Main` runs the app until SIGINT or SIGTERM and exits 1, logging why, if it fails. In order it
sets up logging and telemetry, the health probes (`/api/roux/healthz` and `/api/roux/readyz`),
the database (`DATABASE_URL`), the modules, the front end, and an HTTP server on `ADDR` with every
connection bounded in time. When it is told to stop, it fails readiness, waits `SHUTDOWN_DELAY` so
a load balancer notices, stops taking requests, and lets the modules finish their work in flight
(an email accepted a moment ago still goes out). `app.Run(ctx, cfg)` is the same without the
signals and the exit.

| `app.Config` field | What it is |
| --- | --- |
| `Name` | The service's name in traces and logs. |
| `DisplayName` | The app's name on its pages and in its emails, unless `APP_NAME` says otherwise (and until the owner renames it). |
| `Frontend` | The front end built into the binary: the `frontend` package's `Dist`. |
| `Modules` | `func(k *app.Kit) ([]app.Module, error)`: what the app is made of. |

### Modules

A module is one feature: the tables it owns, the sign-in method it brings, the routes it mounts
and what it does at startup. `modules.go` lists them, so turning a feature on is a line:

```go
func modules(k *app.Kit) ([]app.Module, error) {
	mods := []app.Module{&appRoles{}}
	emails, err := fs.Sub(emailFiles, "emails") // cmd/server/emails: your wording for roux's emails
	if err != nil {
		return nil, err
	}
	email, err := app.EmailLinkFromEnv(k.AppName, emails)
	if err != nil {
		return nil, err
	}
	members := app.UsersFromEnv(email)
	passkeys, err := app.PasskeysFromEnv(k.AppName, email)
	if err != nil {
		return nil, err
	}
	mods = append(mods, email, members, items.Module{})
	if passkeys != nil {
		mods = append(mods, passkeys)
	}
	return mods, nil
}
```

Each stock module reads its settings from the environment. Email sign-in and users are always on;
the others are nil when their feature is off. One
that needs another takes it as an argument (passkeys take the email module), so a missing
dependency does not compile. roux's stock modules:

| Constructor | The feature |
| --- | --- |
| `app.EmailLinkFromEnv(appName, emails)` | Sign-in by an emailed link or typed code; `emails` is the app's wording for any of roux's emails ([Email](email.md)). Needs `CODE_SECRET`. |
| `app.UsersFromEnv(email)` | The users directory, roles and invitations, the owner's theme, the organization, and the first owner ([Users](users.md), [Roles and permissions](roles.md)). |
| `app.PasskeysFromEnv(appName, email)` | Passkeys, for the address in `PUBLIC_URL`. On unless `PASSKEYS=false`. |
| `app.APIKeysFromEnv(email)` | API keys, made by a signed-in person. On unless `API_KEYS=false`. |
| `app.OIDCFromEnv(email, members)` | Sign-in with Google, GitHub or any OpenID Connect provider. Nil without `OIDC_PROVIDERS_FILE`. |
| `app.JWTFromEnv(email)` | Bearer tokens from an authorization server, for API-only callers. Nil without `JWT_ISSUER`. |

An app's own feature is a module too: a type with `Name()`, and any of these, each an interface
in `app`:

- `app.Migrator`: `Migrations() []pgdb.Migration`, its SQL;
- `app.Mounter`: `Mount(ctx, k) error`, its routes;
- `app.Starter`: `Start(ctx, k) error`, run after every module has mounted (checking a list's SQL);
- `app.Drainer`: `Drain()`, work in flight (an email) to finish before the process exits.

[A feature](features.md) builds one. A module's own setting is read with
`app.Getenv(key, fallback)`, `os.Getenv` with a default.

`app.Main` opens the database with `pgdb.Connect`. `app.Assemble` runs every module's migrations together (ordered by each migration's `After` and
`Before`), registers sign-in with every module's method, then mounts the modules and starts them,
in the order listed. A failure names the module.

### Settings

Everything else comes from the environment. A missing required setting stops startup, naming it,
and so does a value roux cannot read: `true` and `false` are the only booleans, and a duration
has a unit (`30s`).

| Variable | What it is |
| --- | --- |
| `DATABASE_URL` | PostgreSQL. Required: a module with tables stops startup without it. |
| `ADDR` | Where the server listens (default `:8080`). |
| `PUBLIC_URL` | Where browsers reach the app (default `http://localhost:8080`): sign-in links point here, and `https://` marks every cookie Secure. Behind a load balancer that ends TLS, set it to the `https` address. |
| `COOKIE_SECURE` | `true` or `false`, overriding what `PUBLIC_URL` says. A `PUBLIC_URL` of `http://` for a host other than this machine is refused unless this is `false`. |
| `APP_NAME` | The app's name, instead of `DisplayName`. |
| `CODE_SECRET` | At least 32 random characters (`openssl rand -base64 32`), the same on every instance: keys the typed sign-in codes. Required. A secret weaker than about 128 bits (its length times log2 of the character kinds it uses: lower case, upper case, numerals, others; one repeated character counts once) logs a warning at startup. `make dev`'s secret is not warned about, but is refused when `PUBLIC_URL` starts with `https://`. |
| `SMTP_ADDR`, `MAIL_FROM` | The mail server, `host:port` (default `localhost:1025`, Mailpit), and the sender (default `no-reply@localhost`). `SMTP_USERNAME` and `SMTP_PASSWORD` are the server's login, both or neither. Mail to a server off this machine goes over STARTTLS unless `SMTP_ALLOW_PLAINTEXT=true`. |
| `EMAIL_RESEND_INTERVAL`, `EMAIL_TOKEN_TTL` | How soon another sign-in email may be asked for, and how long a link or code lasts (defaults `60s` and `5m`). |
| `OWNER_EMAIL`, `OWNER_NAME` | The first owner: while no active user holds `OWNER`, roux creates one at startup, who signs in with that address. Both or neither; once an active owner exists they change nothing, and an address that belongs to someone else stops startup. With neither and nobody able to manage the team, startup stops. |
| `INVITABLE_ROLES` | The roles an invitation may give, comma separated, in the order an invite form offers them (default `USER`). Each must be a role a migration creates; `OWNER` is refused. See [Roles and permissions](roles.md). |
| `ORG_TIME_ZONE`, `ORG_LOCALE` | The organization's IANA time zone (default `UTC`) and BCP 47 locale (default `en-US`): where its day starts and ends, and how dates, numbers and amounts are written. See [Dates and time](dates-and-time.md). |
| `ORG_WEEK_START` | The first day of the organization's week (`Monday`); without it, where `ORG_LOCALE`'s region starts the week (Sunday for `en-US`). See [Dates and time](dates-and-time.md#weeks). |
| `ORG_CURRENCY` | The organization's one currency, an ISO 4217 code (`USD`), once the app has money. See [Money](money.md). |
| `PASSKEYS`, `PASSKEY_RP_ID`, `PASSKEY_ORIGINS` | Passkeys follow `PUBLIC_URL`: its host is the relying party and its address is allowed. `PASSKEYS=false` turns them off; `PASSKEY_RP_ID` names a parent domain instead (`example.com` for `app.example.com`); `PASSKEY_ORIGINS` adds addresses, comma separated. |
| `API_KEYS`, `API_KEY_PREFIX`, `API_KEY_HEADER`, `API_KEY_MAX_LIFETIME` | API keys: `false` to turn them off; what every key starts with (default `roux_`); the header (default `X-API-Key`); the longest a key may last (default a year). |
| `OIDC_PROVIDERS_FILE` | A JSON list of OpenID Connect providers; `${NAME}` in it is an environment variable. Each provider's callback is `PUBLIC_URL/api/roux/auth/oidc/callback/{id}`. `OIDC_SUCCESS_URL`, `OIDC_FAILURE_URL`, `OIDC_LINK_URL` and `OIDC_SIGNUP_ROLE` tune where people land and the role a sign-up gets. |
| `JWT_ISSUER`, `JWT_AUDIENCES`, `JWT_JWKS_URL` | Bearer tokens: the authorization server's issuer, the audiences a token must name one of, and the keys' address for a server without discovery. |
| `FRONTEND_DIR` | Serve the front end from this directory (`frontend/dist`) instead of the one in the binary. The page is read once, at startup: restart the server after rebuilding the front end. |
| `LOG_FORMAT` | `json` (the default) or `text`. |
| `SHUTDOWN_DELAY` | How long to keep serving after readiness fails, with a unit: `5s`. |
| `OTEL_EXPORTER_OTLP_ENDPOINT` and the other `OTEL_*` | Where traces, metrics and logs go (`compose.yaml`'s `otel` profile runs a collector and Grafana). |

roux's tables and the app's are made by the migrations the modules declare (see
[A feature](features.md#the-table)). There is nothing to run by hand: every start
applies the migrations it has not applied, each in its own transaction, and a migration that has
run is never edited.

### The binary

The `frontend` package carries the built front end into the binary. `embed_web.go` embeds
`frontend/dist` when built with the `embedweb` tag; `embed_none.go` is the same package without
it, so `go build`, `go test` and `go vet` need no Node and no `dist` folder. `make build` builds the
front end, then the binary with the tag; without one, the server serves `FRONTEND_DIR`, or else a
stand-in page that says how to build the real one. The `Dockerfile` does the same in a container:
the front end built on Node, the server built on Go, and the binary alone on distroless,
running as a user who is not root.

## The web side

```
npm install @jwcarman/roux-web@0.4.0
npm install @chakra-ui/react @emotion/cache @emotion/react @fontsource-variable/inter @fontsource-variable/lora @fontsource-variable/nunito @tanstack/react-form @tanstack/react-query @tanstack/react-router @tanstack/react-table culori date-fns next-themes react react-dom react-icons zod
```

The Go and web versions must match: use the same version of `github.com/jwcarman/roux` and
`@jwcarman/roux-web`. The second line is the peer dependencies; the app supplies them (`react` and `react-dom`
`^19.3.1`, `@chakra-ui/react` `^3.38.0`, `@emotion/react` and `@emotion/cache` `^11.14.0`,
`@tanstack/react-query` `^5.107.1`, `@tanstack/react-form` `^1.33.5`, `@tanstack/react-router`
`^1.170.46`, `@tanstack/react-table` `^8.21.3`, `date-fns` `^4.4.0`, `zod` `^4.6.7`, `culori`
`^4.0.2`, `next-themes` `^0.4.6`, `react-icons` `^5.7.0`, and the three theme fonts
`@fontsource-variable/inter`, `lora` and `nunito` `^5.3.0`). The browser test kit's peers
(`vitest`, `msw`, `@testing-library/react`, `@testing-library/jest-dom`) are optional; see
[Testing](testing.md). The package is ESM only.

Import from a subpath; there is no root import:

| Subpath | What it is for | Guide |
| --- | --- | --- |
| `@jwcarman/roux-web/problem` | the `Problem` type and `problemOf` | [Errors](errors.md) |
| `@jwcarman/roux-web/api` | the fetch client, `configureApi`, `createQueryClient`, `useServerAction` | [API client](api-client.md), [Queries and mutations](queries-and-mutations.md) |
| `@jwcarman/roux-web/paging` | `PageDto`, `PageParams`, infinite lists and selects | [Tables and paging](tables-and-paging.md) |
| `@jwcarman/roux-web/table` | `QueryTable` and its parts, search inputs | [Tables and paging](tables-and-paging.md) |
| `@jwcarman/roux-web/feedback` | toasts (`notify`), confirmations, error and not-found pages | [Feedback](feedback.md) |
| `@jwcarman/roux-web/form` | Zod rule helpers, `useSchemaForm`, fields, `FormDialog` | [Forms](forms.md) |
| `@jwcarman/roux-web/dates` | ISO strings to and from date-fns Dates (`parseIsoDate`, `formatIsoDate`, `parseIsoTime`, `formatIsoTime`) | [Forms](forms.md#dates-and-times) |
| `@jwcarman/roux-web/organization` | the organization's zone, locale, currency and today | [Dates and time](dates-and-time.md) |
| `@jwcarman/roux-web/money` | amounts: parsing, formatting, the money field | [Money](money.md) |
| `@jwcarman/roux-web/activity` | a record's history | [The activity log](activity-log.md) |
| `@jwcarman/roux-web/users` | the users API client, its queries and mutations | [Users](users.md) |
| `@jwcarman/roux-web/theme` | `ThemeProvider`, colour mode, `useShellTheme`, `createThemeSystem`, `AppearanceSettings` | [The shell](shell.md) |
| `@jwcarman/roux-web/session`, `auth`, `signin`, `navigation` | the session and route guards, sign-in pages, the sidebar frame | [The shell](shell.md) |
| `@jwcarman/roux-web/testing` | the browser test kit | [Testing](testing.md) |

## Set up the app root

`main.tsx` builds one query client with `createQueryClient()`, loads the organization's context
and starts the day watch ([Dates and time](dates-and-time.md)) before rendering: without the
context, `today()`, the formatters and money throw.

```tsx
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { loadOrganization, startDayWatch } from "@jwcarman/roux-web/organization";
import { App, createAppRouter } from "./App";

const queryClient = createQueryClient();
const router = createAppRouter(queryClient);

await loadOrganization().catch((error: unknown) => {
  document.getElementById("root")!.textContent = `The app could not start: ${String(error)}`;
  throw error;
});
startDayWatch(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App queryClient={queryClient} router={router} />
  </StrictMode>,
);
```

`App.tsx` mounts, once each: `QueryClientProvider`, `ThemeProvider` (Chakra's provider with the
app's theme, [The shell](shell.md)), `ColorModeProvider` (light and dark), `ConfirmProvider` (for
`useConfirm`), `SessionProvider`, and `Toaster` (where `notify` toasts appear), then the router
once the session has loaded. The route tests render the same `App`.

- Use `createQueryClient()`, never `new QueryClient()`: mutations' `meta.refreshes` only work with
  roux's client, and `useSchemaForm` and `useServerAction` throw when a mutation names
  `meta.refreshes` on another client. `createQueryClient(): QueryClient` takes no options.
- `Toaster` and `ConfirmProvider` render Chakra components, so they go inside `ThemeProvider`.
  `useConfirm` throws outside `ConfirmProvider`.
- Pass the same `queryClient` to TanStack Router's context if route loaders prefetch.

`SessionProvider` is roux's ([The shell](shell.md#the-session-and-route-guards)): it loads the
caller (`/api/roux/auth/me`) and their profile (`/api/roux/users/me`), empties the query cache
when the identity changes, and reloads the caller when an API call reports the session lost.
Components read it with `useSession()`, and route guards with `context.session.currentMe()`.

An app that keeps a session of its own does the same two roux things with
`useClearQueriesOnIdentityChange(identityId: string | null | undefined): void`, which empties the
query cache when the identity goes away (`null`) or changes, so nobody sees rows cached for the
previous user (`undefined`, still loading, changes nothing; call it inside `QueryClientProvider`),
and `onSessionLost(listener)`, which runs `listener` whenever an `/api` call answers 401 and
returns the function that stops it.

## Point the client at the API

Nothing to do. The client's defaults are `baseUrl` `/api`, `csrfBootstrapPath`
`/api/roux/auth/me` and `sessionPathPrefix` `/api/`, which match a roux server. Only if the API
lives elsewhere on the same origin, call `configureApi` once in `main.tsx` before rendering:

```ts
import { configureApi } from "@jwcarman/roux-web/api";

configureApi({ baseUrl: "/v2", sessionPathPrefix: "/v2/" });
```

Details in [API client](api-client.md#change-where-the-api-lives).

## One origin

roux requires the pages and the API to be served from one origin: the client calls relative paths
(`/api/...`), the session is a cookie, and CSRF reads a cookie the page can see. Two deployments are
supported:

1. **One binary (the default).** The server serves the built front end, and answers any page URL
   with the shell: a GET or HEAD that accepts `text/html`, has no file extension and is not under
   `/api/`, `/assets/` or `/.well-known/`. Adding a page is adding its route file; the server has no
   list of pages, and an unknown URL gets the shell, whose not-found route answers it. The shell is
   open to signed-out visitors (with `/assets/`, which roux caches for a year), so a reload or a deep
   link opens the app, which sends the visitor to sign in. A fetch for JSON, an API path (a missing
   one is still a `404` problem) and a request for a file never get the shell. `spa.Register` does
   this; `app.Run` calls it.
2. **Edge routing.** Static hosting or a CDN serves the pages, and a proxy on the same domain routes
   `/api` to the app.

Separate origins (the pages on one host calling the API on another, with CORS and cross-site
cookies) are not supported; `baseUrl` is a path, not a host. In development, Vite's dev server
passes `/api` to the Go server:

```ts
// vite.config.ts
const backend = "http://localhost:8080";

export default defineConfig({
  server: {
    proxy: {
      "/api": backend,
    },
  },
});
```

Every sign-in endpoint is under `/api/roux/auth`, so this one entry covers the app's API and its
sign-in.

## The shell

roux serves `index.html` (package `spa`; no code in the app). Each response is the built page with
four placeholders filled, `Cache-Control: no-store` (a stored copy's nonce would not match the next
response's policy) and its own `Content-Security-Policy` header. The front-end build leaves the
placeholders; the server does not start if one is missing:

```html
<title>__APP_NAME__</title>
<script type="application/json" id="app-theme">__APP_THEME__</script>
<script type="application/json" id="app-context">__APP_CONTEXT__</script>
```

and `html: { cspNonce: "__CSP_NONCE__" }` in `vite.config.ts`, which makes Vite write
`nonce="__CSP_NONCE__"` on every script and style tag it emits. The name is HTML-escaped into the
title; the theme and the organization's context ([Dates and time](dates-and-time.md)) are JSON
with every `<` escaped, so nothing in it can end the element. One pass fills them, so an app named
`__APP_THEME__` shows that name.

**The policy:** `default-src 'self'`; `script-src` and `style-src` `'self'` plus the response's
nonce; `img-src 'self' data:`; `font-src`, `connect-src`, `frame-src`, `media-src` and
`form-action` `'self'`; `object-src 'none'`; `base-uri 'self'`; `frame-ancestors 'none'`. It never
holds `'unsafe-inline'` or `'unsafe-eval'`. `spa.Config.CSP` adds sources to a directive, after the
defaults; nothing loosens `default-src`, `object-src`, `base-uri` or `frame-ancestors`, and a source
that would undo the policy (`*`, `'unsafe-inline'`, `'unsafe-eval'`, a bare scheme for scripts or
styles) stops startup. `app.Run` registers the shell with the defaults alone, so an app that needs
another source calls `app.Assemble` and `spa.Register` itself.

**The theme** (`spa.Theme`: `appName`, `palette`, `brandColor`, `shape`, `depth`, `headingFont`,
`bodyFont`) is read for every page, so a theme the owner has just saved is in the next page. The
users module keeps the owner's theme in roux's table `roux_theme`; until the owner chooses, it is
the app's default look: `Config.Look` in `app.Config` (`spa.Clean`, `spa.Friendly`, `spa.Bold`,
`spa.Calm` or `spa.Classic`, or a `spa.Look{Palette, Shape, Depth, HeadingFont, BodyFont}` of your own;
the zero value is `Clean`: palette `gray`, brand colour `#3b82f6`, shape `medium`, depth `flat`, fonts
`standard`), under the app's name. `Run` refuses an invalid `Look` at start-up. A part the owner has
saved wins; the rest follows the look.

### The owner's theme

The users module serves the theme:

- `GET /api/roux/theme`, open to anyone, signed out too (the sign-in page needs its look): the
  whole theme and its `version`, 0 until the first save.
- `PUT /api/roux/theme`, for whoever holds `theme.manage` (`theme.ThemeManage`, granted to
  `OWNER`): the theme with the `version` the owner read. A stale one is a `409`, a missing one a
  `400` on `version`. The values are the shell's own: palette
  `gray|red|orange|yellow|green|teal|blue|cyan|purple|pink|brand`, shape
  `square|slight|medium|round|extra-round`, depth `flat|raised`, fonts `standard|modern|friendly|classic`, a `#rrggbb`
  colour (kept lower-case) and a name of 1 to 60 characters (trimmed); a bad one is a `400` naming
  the field.

The template's Appearance page edits it with roux-web's `AppearanceSettings`.

`@jwcarman/roux-web` runs under this policy: `@jwcarman/roux-web/form` calls
`z.config({ jitless: true })` when it loads, so Zod never probes `eval`. The package's
`package.json` marks that file in `sideEffects` so bundlers keep it; do not override `sideEffects`
for the package or tree-shake it away.

## Next

- [A feature](features.md): a feature's table, service, queries and commands, and its screen as a surface.
- [Errors](errors.md): refusing a request on the server and showing why in the browser.
- [API client](api-client.md): one API module per resource.
- [Queries and mutations](queries-and-mutations.md), [Forms](forms.md),
  [Tables and paging](tables-and-paging.md), [Feedback](feedback.md), [Testing](testing.md).
