# App setup: a new app, settings, the root, the shell

For a new app, the wiring, the shell (theme, sign-in, navigation, CSP) and the session. A template
app already has all of it; read this when changing it.

## Rules

- **Versions:** this skill describes roux **0.3.0**: `<roux.version>0.3.0</roux.version>` (the
  `roux-bom` import) and `npm install @jwcarman/roux-web@0.3.0`. The two must match each other and
  this; if the project's differ, tell the user before anything else.
- One stack: Java 25, Spring Boot 4.1, Maven, PostgreSQL + Liquibase, jpa-utils, who, React 19,
  Chakra UI v3, TanStack Router/Query/Form/Table, Zod 4, Vitest + MSW, Playwright.
- Every roux app uses who; sign-in is passwordless (emailed links with codes, passkeys).
- The SPA and the API share one origin (one jar, or edge routing). Separate origins are not supported.
- Import roux-web only from subpaths: `/problem`, `/api`, `/paging`, `/table`, `/feedback`, `/form`,
  `/dates`, `/theme`, `/signin`, `/session`, `/navigation`, `/money`, `/activity`, `/organization`,
  `/testing`. No root import, nothing from its source.
- No versions on roux's, who's or jpa-utils' dependencies (`roux-bom` pins versions tested
  together); don't add who's starter yourself: roux's starter brings it.
- Never write the theme, nonce or title into `index.html`, mount `ChakraProvider` or an Emotion
  `CacheProvider`, or hand-write sign-in calls.

## Steps: a new app

1. `npm create @jwcarman/roux-app acme-gym` (Node 20+).
2. `./mvnw spring-boot:run -Dspring-boot.run.arguments="--roux.owner.email=you@example.com --roux.owner.name=You"`
   (Docker: `compose.yaml` starts PostgreSQL and Mailpit).
3. Sign in with a link from Mailpit (<http://localhost:8025>).
4. Add features with `feature.md`.

By hand: `roux-bom` import, `roux-spring-boot-starter`, optionally `roux-theme`,
`spring-boot-starter-mail` + `who-email-smtp`, JPA, Liquibase, `postgresql`.

## Names: required settings (`application.yml`)

| Setting | Notes |
| --- | --- |
| `roux.organization.time-zone`, `roux.organization.locale` | required (`dates.md`) |
| `roux.owner.email`, `roux.owner.name` | the first owner (`RouxOwnerProperties`) |
| `roux.roles.invitable` | roles invitations may give; never `OWNER` |
| `roux.money.currency` | once the app has money (`money.md`) |
| `spring.mail.host`/`port`, `who.email.from` | who's emails over SMTP |
| `who.email-link.link-base-url`, `who.email-link.code-secret` (≥ 32 chars) | required |
| `who.passkey.rp-id`, `who.passkey.allowed-origins` | required; set origins in development |
| `who.security.public-paths` | only files a signed-out browser loads (an icon) |

who's and roux's tables come from migratory before the app's master changelog;
`migratory.drop-first=true` rebuilds a development database. Other `@ConfigurationProperties`:
`RouxAuditingProperties`, `RouxOrganizationProperties`, `RouxRolesProperties`, `RouxMoneyProperties`.
Wiring you never reference: `ClockDateTimeProvider`, `IdentityAuditor` (audit columns, with
`@EnableJpaAuditing`), `OrganizationController`, `OrganizationContextSource`.

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
- `SessionProvider` / `useSession()` → `Session`: `me` (who's `Me`; `undefined` loading, `null`
  signed out), `profile` (`Profile`), `refresh`, `refreshProfile`, `signOut`, `currentMe()`.
- Guards for `beforeLoad`: `requireSignedIn(me)`, `requireSignedOut(me)`,
  `requirePermission(context.me, PERM)`.
- An app with its own session: `useClearQueriesOnIdentityChange(identityId)` and
  `onSessionLost(listener)` (`isSessionLost` tells a lost-session error).
- API location: defaults `/api` and `/who/me`; only otherwise `configureApi({ baseUrl, sessionPathPrefix })`
  (`ApiSettings`, read back with `apiSettings()`) plus `roux.problems.api-path-prefix`.
- Lower-level calls: `get`/`send` (raw `Response`), `getJson`/`sendJson` with `RequestOptions`
  (`params`: `QueryParams`, `signal`).

## Names: the shell

- Server (`roux-spa`): `ShellRoutes` serves `index.html` with `__APP_NAME__`, `__APP_THEME__`,
  `__APP_CONTEXT__`, `__CSP_NONCE__` filled (`ShellPage` checks them); `SpaFallbackFilter` answers
  any page URL with the shell (`roux.spa.excluded-paths`, `RouxSpaProperties`).
- CSP: `ContentSecurityPolicy.strict()`, never `unsafe-inline`/`unsafe-eval`; add sources with
  `roux.spa.csp.<directive>` (`img-src`, `connect-src`, ...).
- Theme: `ShellTheme` from a `ShellThemeSource` bean, else `roux.theme.*` (`RouxThemeProperties`).
  `roux-theme` adds `/api/theme` (`ThemeController`, `ThemeService`, `ThemeRequest`,
  `ThemeResponse`, `AppTheme`, `AppThemeRepository`, `OwnerShellTheme`).
- Browser (`/theme`): `ThemeProvider` (replaces `ChakraProvider`), `useShellTheme()` →
  `ShellThemeState` (`shown.appName`), `createThemeSystem`, `cspNonce()`, `AppearanceSettings` (the
  whole Appearance page, guarded by `theme.manage`); types `Palette`, `Shape`, `Font`.
- Navigation (`/navigation`): `defineNav(PERMISSIONS, [{ label, to, icon, permission?, description, start? }])`
  → `Nav` of `NavEntry` (`to` is a `NavTo`); `navItemsFor`, `startPathFor`, `openingRedirect`;
  `AppShell` (`AppShellProps`: `nav`, `permissions`, `appName`, `logo`, `account` as an
  `AccountLayout`), `NavLinks` (`NavLinksProps`), `RAIL_LABELS`; `AccountMenu` (`AccountMenuProps`)
  with `AccountMenuLink`, `AccountMenuItem`, `AccountMenuSwitch`, `AccountMenuSeparator`;
  `PageHeader` (`PageHeaderProps`: `title`, actions as children).
- Sign-in (`/signin`): `SignInFrame` (`SignInFrameProps`), `SignInCard` (`SignInCardProps`: `appName`,
  `logo`), `EmailSignIn`, `PasskeySignInButton`, `ProviderSignInButtons`, `ProviderSignInButton`
  (`ProviderSignInButtonProps`), `EmailLinkLanding` (at `/signin/link`), `PasskeySettings`
  (`PasskeySettingsProps`: `onSignedOut`), `passkeyLabelError`, `PASSKEY_LABEL_MAX`,
  `useSignInReturn`, `rememberSignInReturn`, `takeSignInReturn`, `isReturnable`.

## Check

The app starts (`./mvnw spring-boot:run`): a missing required setting fails startup naming it.
`./mvnw verify` runs the Playwright CSP test.

## Pitfalls

- `who.passkey.allowed-origins` defaults to `https://<rp-id>`: set it for `http://localhost:8080`.
- A public path is a `WhoPublicPathContributor` bean, never a replaced `WhoPublicPaths`.
- `spring.liquibase.drop-first` fails startup: use `migratory.drop-first`.
- A CSP source like `*` or `'unsafe-inline'` stops the app from starting.
