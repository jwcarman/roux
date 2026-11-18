# roux serves the app's shell, and owns its theme

Approved by the user on 2026-11-17.

## Why

Every roux app hand-writes the same shell: a controller that serves `index.html` with a CSP nonce,
the CSP header and no-store, and that writes the theme and the app's name into the page so it never
flashes the wrong look. The dojo's version is `ShellController`, `ContentSecurityPolicy`, a `theme/`
package (entity, options, service, controller), `shell/theme*.ts` and a 322-line `Appearance.tsx`.
It is easy to get subtly wrong (nonce handling, CSP), and nothing tells an agent when it has. roux
already routes page requests to the shell (roux-spa); it should serve the shell too.

## Goals

- An app writes no shell code: roux-spa serves `index.html` with the nonce, the CSP header,
  `Cache-Control: no-store`, and the theme and app name in place.
- Owner-editable theming is a jar (`roux-theme`). Without it, an app still gets a themed shell.
- The browser code is the same whichever theme source is behind it.

## Non-goals

- A theme per user; dark mode stays the visitor's own choice, as today.
- Arbitrary CSS or uploaded fonts.

## Anti-goals

- A CSP an app can loosen by accident. Loosening is explicit and visible in configuration.

## Approaches

- **Chosen: a seam in roux-spa.** `ShellThemeSource` is the interface the shell reads; roux-theme
  implements it when present, an app may provide its own, and a property-backed default applies
  otherwise.
- Rejected: roux-theme required for any themed shell (forces a table on fixed-brand apps);
  app-provided storage behind an interface for roux-theme (more wiring for agents — the user chose
  roux owns the table).

## Design

- **roux-spa** (the seam):
  - `record ShellTheme(String appName, String palette, String brandColor, String shape,
    String headingFont, String bodyFont)` and `@FunctionalInterface interface ShellThemeSource {
    ShellTheme current(); }`.
  - Default source (`@ConditionalOnMissingBean`): `roux.theme.*` properties (palette, brand-color,
    shape, heading-font, body-font, app-name), defaulting to Chakra's stock look and
    `spring.application.name`.
  - Serves the shell: the page request (already rewritten to `/index.html` by the fallback filter)
    gets `index.html` with this request's nonce where Vite's placeholder is, the theme JSON and app
    name injected, `Cache-Control: no-store`, and the CSP header.
  - CSP: a strict default (`script-src 'nonce-…'`, `object-src 'none'`, `base-uri 'self'`,
    `frame-ancestors 'none'`, and only the style allowances Chakra/Emotion need — derive from the
    dojo's current policy and its CSP E2E). Extended only by explicit properties per directive
    (e.g. `roux.spa.csp.connect-src`), appended, never replacing the defaults.
- **roux-theme** (owner-editable, roux owns the table):
  - Entity + Liquibase changelog shipped in the jar; `GET /api/theme` (anyone, signed out too — the
    shell needs it), `PUT /api/theme` behind a `theme.manage` who permission; edits carry a version
    (`Versions.require`).
  - Allowed values validated with roux-validation: palette from Chakra's palettes plus `brand`,
    shape, font from fixed sets, brand colour a hex colour, app name required ≤ 60.
  - Provides the `ShellThemeSource` bean backed by the table (falls back to the property defaults
    when no row exists).
- **roux-web `/theme`** entry: `createThemeSystem(theme)` (a Chakra system), a provider reading the
  injected JSON, `useShellTheme()`, and `<AppearanceSettings />` (the settings form with live preview,
  saving through roux-theme's endpoint; built with `useSchemaForm`).
- **Auto-configuration** in roux-autoconfigure, each switched on by its jar; the starter brings
  roux-theme.
- **The dojo** deletes `ShellController`, `ContentSecurityPolicy`, `theme/`, and its shell theme code,
  keeps a route rendering `<AppearanceSettings />`; its CSP, caching and appearance E2E specs pass
  unchanged.

## Left to the builder

- Exact property names under `roux.theme` / `roux.spa.csp`, the theme table's name, the font and
  shape sets (start from the dojo's), how the nonce placeholder is found (the dojo's convention).

## Part 3: sign-in (added 2026-11-17, approved)

Prior art: who's example app, `who-examples/spa/frontend/src/pages/SignIn.tsx` (link, code with
`autoComplete="one-time-code"`, passkey, OIDC providers from `who.signInOptions()`, pending sign-up).

- **The page is the app's, the pieces are roux's** (user decision): roux-web ships components, ported
  from that page in Chakra, and the sign-in page that composes them is generated when a new roux app
  is created (then the app's to change). The components: `<EmailSignIn />` (email me a link, then
  "open the link, or type the code from the email" via `who.email.signIn({ email, code })`, who's
  error under the field), `<PasskeySignInButton />`, `<ProviderSignInButtons />` (one per provider
  `signInOptions()` reports), and `useSignInReturn()` (return to the page the visitor asked for:
  the dojo's `rememberReturn`/`takeReturn`, moved into roux-web), which each calls after a sign-in.
  The same rule applies to Appearance: roux ships `<AppearanceSettings />`; the page placing it is
  the app's.
- **Open:** roux has no "create a new app" step yet (the dojo started from a copy of the template's
  shell). Where generation lives (a roux app template, or a plugin generator an agent runs) gets its
  own short design after this round.
- **roux-web `<ProviderSignInButton provider="google" />`**: takes the provider's id as who reports
  it; links to `who.oidc.authorizeUrl(id)`; shows the provider's icon and "Continue with <Name>" for
  known providers (Google, Microsoft, GitHub, Apple, GitLab, Okta…; icons from react-icons), and a
  generic icon with the provider's display name for any other. `icon` and `label` props override.
  Usable alone, for an app that lays out its own sign-in page. Follows each provider's published
  button guidance where one exists (Google's in particular).
- The dojo rebuilds its `SignIn.tsx` from these components (proving they compose) and drops its
  hand-written sign-in calls; `code.spec.ts` types the
  code into the page.
