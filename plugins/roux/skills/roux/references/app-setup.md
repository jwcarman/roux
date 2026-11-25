# App setup: a new app, settings, the root, the shell

For a new app, the wiring, the shell (theme, sign-in, navigation, CSP) and the session. A template
app already has all of it; read this when changing it.

## Rules

- **Versions:** this skill describes roux **0.4.0** (the Go server; still unreleased while it
  follows `main`): `github.com/jwcarman/roux` in `go.mod` and `@jwcarman/roux-web` in
  `frontend/package.json`. If the project's versions are older, tell the user before anything else:
  roux 0.3.0 and earlier were Spring Boot, and nothing here applies to them.
- One stack: Go 1.27, `net/http`, pgx v5, PostgreSQL 17 with SQL migrations, React 19, Chakra UI
  v3, TanStack Router/Query/Form/Table, Zod 4, Vitest + MSW, Playwright.
- The SPA and the API share one origin (one binary, or edge routing). Separate origins are not
  supported.
- Import roux-web only from subpaths: `/problem`, `/api`, `/paging`, `/table`, `/feedback`, `/form`,
  `/dates`, `/theme`, `/auth`, `/signin`, `/session`, `/navigation`, `/money`, `/activity`,
  `/organization`, `/users`, `/testing`. No root import, nothing from its source.
- Settings are environment variables; secrets (`CODE_SECRET`) never go in the repository.
- Never write the theme, nonce or title into `index.html`, mount `ChakraProvider` or an Emotion
  `CacheProvider`, or hand-write sign-in calls.

## Steps: a new app

1. `npm create @jwcarman/roux-app team-planner` (Node 20+): the directory, the Go module and the npm
   name.
2. `docker compose up -d` (PostgreSQL on 5432, Mailpit on <http://localhost:8025>).
3. `make web`, then
   `CODE_SECRET=$(openssl rand -base64 32) DATABASE_URL=postgres://app:app@localhost:5432/app OWNER_EMAIL=you@example.com OWNER_NAME=You PASSKEY_RP_ID=localhost PASSKEY_ORIGINS=http://localhost:8080 FRONTEND_DIR=frontend/dist LOG_FORMAT=text go run ./cmd/server`.
   For pages, `npm run dev` in `frontend/` too (Vite on 5173, `/api` passed to the server).
4. Sign in as `OWNER_EMAIL` with the link from Mailpit.
5. Add features with `feature.md`.

`make check` runs gofmt, `go vet`, golangci-lint and the Go tests; `make build` the one-file binary
with the front end inside; `make image` the container image.

## Names: the server

- `cmd/server/main.go`: `app.Main(app.Config{Name, DisplayName, Frontend: frontend.Dist, Modules: modules})`.
- `cmd/server/modules.go`: `modules(k *app.Kit) ([]app.Module, error)`, roux's modules then the
  app's; and `permissions()` (`permissions.md`).
- Stock modules (nil when their setting is missing): `app.EmailLinkFromEnv(appName, emails)` (needs
  `CODE_SECRET`; `emails` is `cmd/server/emails`, `email.md`), `app.UsersFromEnv(email)`, `app.PasskeysFromEnv(appName, email)`
  (`PASSKEY_RP_ID`), `app.APIKeysFromEnv(email)`, `app.OIDCFromEnv(email, members)`
  (`OIDC_PROVIDERS_FILE`), `app.JWTFromEnv(email)` (`JWT_ISSUER`).
- A module is any type with `Name() string`, plus what it needs:
  - `app.Migrator`: `Migrations() []pgdb.Migration`;
  - `app.Mounter`: `Mount(ctx, k) error`, its routes;
  - `app.Starter`: `Start(ctx, k) error`, after every module mounted (`list.Check`);
  - `app.Drainer`: `Drain()`, work to finish before exit;
  - `app.SignInProvider`: a way of signing in (roux's own modules).
- `app.Kit`: `Pool`, `AppName`, `Mux`, `Organization` (a func; the users module points it at the
  `ORG_*` settings when it mounts, UTC and `en-US` until then), and the route methods `Handle`,
  `HandleSignedIn`, `HandlePublic`.
- `pgdb.Migration{Name, FS, Dir, After}`; `pgdb.Migrate` keeps checksums in `schema_history`.
  `pgdb.Connect(ctx, url)` is how `app.Main` opens the pool. `app.Getenv(key, fallback)` reads a
  setting with a default, for a module's own setting.

## Names: settings (environment variables)

| Variable | Notes |
| --- | --- |
| `DATABASE_URL` | PostgreSQL; without it nobody can sign in |
| `ADDR`, `PUBLIC_URL`, `COOKIE_SECURE` | where it listens (`:8080`), where browsers reach it (links point here; `https://` makes cookies Secure) |
| `APP_NAME` | the app's name, instead of `DisplayName` |
| `CODE_SECRET` | ≥ 32 random characters, the same on every instance; signing in is off without it |
| `SMTP_ADDR`, `MAIL_FROM`, `SMTP_ALLOW_PLAINTEXT`, `EMAIL_RESEND_INTERVAL`, `EMAIL_TOKEN_TTL` | email (`email.md`) |
| `OWNER_EMAIL`, `OWNER_NAME` | the first owner, both or neither |
| `INVITABLE_ROLES` | roles invitations may give (default `USER`); never `OWNER` |
| `ORG_TIME_ZONE`, `ORG_LOCALE` | the organization's zone and locale (`dates.md`) |
| `ORG_CURRENCY` | once the app has money (`money.md`) |
| `PASSKEY_RP_ID`, `PASSKEY_ORIGINS` | passkeys; set origins to `http://localhost:8080` in development |
| `API_KEYS`, `API_KEY_PREFIX`, `API_KEY_HEADER`, `API_KEY_MAX_LIFETIME` | API keys (`off` to turn off) |
| `OIDC_PROVIDERS_FILE` | OpenID Connect providers, a JSON list |
| `JWT_ISSUER`, `JWT_AUDIENCES`, `JWT_JWKS_URL` | bearer tokens for API-only callers |
| `FRONTEND_DIR`, `LOG_FORMAT`, `SHUTDOWN_DELAY`, `OTEL_*` | development and operations |

## Names: the app root (`main.tsx`)

```tsx
const queryClient = createQueryClient();
await loadOrganization();
startDayWatch(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ConfirmProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ConfirmProvider>
        <Toaster />
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- `createQueryClient()` (never `new QueryClient()`); `shouldRetry` is its retry rule (no retry on
  a 4xx).
- `SessionProvider` / `useSession()` → `Session`: `me` (`Me`, from `/api/roux/auth/me`; `undefined` loading, `null`
  signed out), `profile` (`Profile`), `refresh`, `refreshProfile`, `signOut`, `currentMe()`.
- Guards for `beforeLoad`: `requireSignedIn(me)`, `requireSignedOut(me)`,
  `requirePermission(context.me, PERM)`.
- An app with its own session: `useClearQueriesOnIdentityChange(identityId)` and
  `onSessionLost(listener)` (`isSessionLost` tells a lost-session error).
- API location: defaults `/api` and `/api/roux/auth/me`; only behind a proxy that moves the API
  `configureApi({ baseUrl, sessionPathPrefix })` (`ApiSettings`, read back with `apiSettings()`).
- Lower-level calls: `get`/`send` (raw `Response`), `getJson`/`sendJson` with `RequestOptions`
  (`params`: `QueryParams`, `signal`).

## Names: the shell

- Server (package `spa`, no app code): serves `index.html` with `__APP_NAME__`, `__APP_THEME__`,
  `__APP_CONTEXT__` and `__CSP_NONCE__` filled; startup fails if one is missing. Every page URL
  gets the shell.
- CSP: strict, never `unsafe-inline`/`unsafe-eval`. `spa.Config.CSP` adds sources to a directive;
  `app.Run` uses the defaults alone, so an app that needs another source calls `app.Assemble` and
  `spa.Register` itself.
- Theme: `spa.Theme` (`appName`, `palette`, `brandColor`, `shape`, `headingFont`, `bodyFont`), kept
  by the users module in `roux_theme` (`GET`/`PUT /api/roux/theme`, `theme.manage`); until the owner
  saves one, `spa.StockTheme(appName)`.
- Browser (`/theme`): `ThemeProvider` (replaces `ChakraProvider`), `useShellTheme()` →
  `ShellThemeState` (`shown.appName`), `createThemeSystem`, `cspNonce()`, `AppearanceSettings` (the
  whole Appearance page, guarded by `theme.manage`); types `Palette`, `Shape`, `Font`.
- Navigation (`/navigation`): `defineNav(PERMISSIONS, [{ label, to, icon, permission?, description, start? }])`
  → `Nav` of `NavEntry` (`to` is a `NavTo`); `navItemsFor`, `startPathFor`, `openingRedirect`;
  `AppShell` (`AppShellProps`: `nav`, `permissions`, `appName`, `logo`, `account` as an
  `AccountLayout`), `NavLinks` (`NavLinksProps`), `RAIL_LABELS`; `AccountMenu` (`AccountMenuProps`)
  with `AccountMenuLink`, `AccountMenuItem`, `AccountMenuSwitch`, `AccountMenuSeparator`;
  `PageHeader` (`PageHeaderProps`: `title`, actions as children).
- Colour mode (`/theme`): `ColorModeProvider` around the app (system mode until the visitor
  picks), `ColorModeButton` (an icon button, in the sign-in frame's `tools`), `ColorModeSwitch`
  ("Dark mode" in the account menu). The owner's theme is a `ShellTheme`.
- The sign-in client (`/auth`): `createAuthClient(options?)` (`AuthClientOptions`) → `AuthClient`:
  `signInOptions()` (`SignInOptions`, `SignInProvider`), `signOut()`, `me` (`MyAccount`: `get`,
  `sessions` as `Sessions`, `passkeys` as `MyPasskeys`, `emailAddresses` as `EmailAddresses`,
  `accounts` as `Accounts`, `apiKeys` as `ApiKeys`), `email` (`Email`), `passkeys` (`Passkeys`),
  `oidc` (`Oidc`). Each call answers an `AuthResult`; `unwrap(result)` returns the value or throws
  `AuthError`. Use it only for a page the components don't cover.
- Its types: `Me`, `CredentialCounts`, `Session`, `Passkey`, `EmailAddress`, `ConfirmedAddress`,
  `LinkedAccount`, `PendingSignUp`, `ApiKey`, `ApiKeyRequest`, `NewApiKey` (its secret shows once),
  `SignedIn`, `HumanCheckOptions`. Its reasons: `SignInRequired`, `BrowserSessionRequired`,
  `InvalidRequest`, `LastCredential`, `EmailSignInFailure`, `HumanCheckFailed`,
  `ConfirmAddressFailure`, `ApiKeyCallerRefused`, `ApiKeyCannotManageKeys`; a dismissed browser
  prompt is a `PromptFailure` (`Cancelled`, `AlreadyRegistered`).
- Sign-in (`/signin`): `SignInFrame` (`SignInFrameProps`), `SignInCard` (`SignInCardProps`: `appName`,
  `logo`), `EmailSignIn`, `PasskeySignInButton`, `ProviderSignInButtons`, `ProviderSignInButton`
  (`ProviderSignInButtonProps`), `EmailLinkLanding` (at `/signin/link`), `PasskeySettings`
  (`PasskeySettingsProps`: `onSignedOut`), `passkeyLabelError`, `PASSKEY_LABEL_MAX`,
  `useSignInReturn`, `rememberSignInReturn`, `takeSignInReturn`, `isReturnable`.

## Check

The app starts (`go run ./cmd/server`): a bad setting stops startup naming it, and so does an edited
migration.

## Pitfalls

- `PASSKEY_ORIGINS` defaults to `https://<rp id>`: set it for `http://localhost:8080`.
- A module that reads `k.Organization()` at mount, listed before the users module: it gets UTC
  and `en-US`, not the `ORG_*` settings.
- A `PUBLIC_URL` of `http://` for another host is refused unless `COOKIE_SECURE=false` says so.
- A CSP source like `*` or `'unsafe-inline'` stops the app from starting.
