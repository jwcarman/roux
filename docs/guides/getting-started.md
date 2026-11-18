# Getting started

roux is the base a Spring Boot + React application is built on: a Java starter that answers every
API error as a Problem Detail, and a web package (`@jwcarman/roux-web`) with the matching API client,
paging, tables, forms and feedback. This guide adds both to an app and wires the app root. After it,
features use roux by importing from it; no plumbing is written in the app.

## Requirements

roux supports one stack and nothing else:

- Java 25, Spring Boot 4.1 (`spring-boot-starter-parent` 4.1.x), Maven.
- PostgreSQL with Liquibase; jpa-utils for paging.
- who for identity: sign-in, the session and CSRF. Every roux app uses it.
- React 19, Chakra UI v3, TanStack Router, Query, Form and Table, Zod 4.
- Vitest with MSW, and Playwright, for tests.

## Add the Java side

Import `roux-bom` and depend on `roux-spring-boot-starter`, plus mail, JPA, Liquibase and the
PostgreSQL driver. Keep Spring Boot's parent as the app's parent: `roux-bom` does not import Spring
Boot's BOM, so Spring Boot's managed versions stay the parent's.

```xml
<properties>
    <roux.version>0.2.0</roux.version>
</properties>

<dependencyManagement>
    <dependencies>
        <dependency>
            <groupId>org.jwcarman.roux</groupId>
            <artifactId>roux-bom</artifactId>
            <version>${roux.version}</version>
            <type>pom</type>
            <scope>import</scope>
        </dependency>
    </dependencies>
</dependencyManagement>

<dependencies>
    <dependency>
        <groupId>org.jwcarman.roux</groupId>
        <artifactId>roux-spring-boot-starter</artifactId>
    </dependency>
    <!-- the owner's theme (an Appearance page); remove it for a fixed brand -->
    <dependency>
        <groupId>org.jwcarman.roux</groupId>
        <artifactId>roux-theme</artifactId>
    </dependency>
    <!-- delivers who's emails (sign-in links, invitations) over SMTP; the roux starter brings who-email, which
         renders them, but not how they are sent. who-email-smtp brings spring-boot-starter-mail -->
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-mail</artifactId>
    </dependency>
    <dependency>
        <groupId>org.jwcarman.who</groupId>
        <artifactId>who-email-smtp</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-data-jpa</artifactId>
    </dependency>
    <dependency>
        <groupId>org.springframework.boot</groupId>
        <artifactId>spring-boot-starter-liquibase</artifactId>
    </dependency>
    <dependency>
        <groupId>org.postgresql</groupId>
        <artifactId>postgresql</artifactId>
        <scope>runtime</scope>
    </dependency>
</dependencies>
```

The starter brings `roux-problems`, `roux-validation` (`@Phone`, `@NotInFuture` and roux's validation messages), `roux-spa` (the shell for any page URL), `roux-jpa` (`Versions`), `roux-autoconfigure`, who (`who-spring-boot-starter`, with
email-link sign-in, `who-email-link`, which renders its mail with `who-email`, and passkeys, `who-passkey`), jpa-utils
(`org.jwcarman.jpa:jpa-utils`), `spring-boot-starter-validation` and `spring-boot-starter-webmvc`.
`roux-theme` (the owner changes the look on an Appearance page) is not in the starter: add it beside the starter, with no version, as a new app does. Leave it out for a fixed brand and set `roux.theme.*` instead ([The owner's theme](#the-owners-theme)).
Do not add who's starter yourself, and do not declare versions for any of them, for who's other
modules (`who-test`), or for jpa-utils: `roux-bom` pins who 0.23.0 and jpa-utils 0.2.0. The test
dependencies are in [Testing](testing.md#dependencies).

Errors are answered as Problem Details from the first request; see [Errors](errors.md). roux's own
settings, both optional, are under `roux.problems` (`enabled`, `api-path-prefix`). who's are not
optional: the app does not start without them.

## Required settings

who's two sign-in methods fail startup until they are configured, and the message names the
missing setting. In `application.yml`, for development on `http://localhost:8080`:

```yaml
spring:
  mail:
    host: localhost   # an SMTP server; in development, Mailpit or similar
    port: 1025

who:
  initialize-schema: never   # Liquibase creates who's tables (below)
  security:
    public-paths:            # what a signed-out browser may load besides the shell and /assets/**
      - /favicon.svg
  email-link:
    link-base-url: http://localhost:8080/signin/link
    code-secret: development-only-code-secret-not-for-production
  passkey:
    rp-id: localhost
    allowed-origins: http://localhost:8080
  email:
    from: noreply@example.com   # the address every who email is sent from
```

| Setting | What it is |
| --- | --- |
| `spring.mail.host` | The SMTP server who's emails go through (`who-email-smtp`, over Spring Boot's `JavaMailSender`). Instead of SMTP, an app may register its own `WhoEmailSender` bean (leave out `who-email-smtp`, keep `who-email`): it only delivers, receiving every who email already rendered as an `OutgoingEmail` (`to`, `subject`, `text`, an optional `html`, and the `source` record it was rendered from). Send `text` as `text/plain`, never inside HTML: it is not escaped. who renders the wording from templates the app can replace (`templates/who/email/<template>.txt`), and each subject is the message `who.email.<template>.subject`. |
| `who.email-link.link-base-url` | The app's page that receives sign-in links; who appends `#token=...`. Required. |
| `who.email-link.code-secret` | Keys the typed sign-in codes: at least 32 characters, the same on every instance, from the environment in production. Required. |
| `who.email.from` | The one address every who email (sign-in links, invitations, the passkey-added notice) is sent from. Required with `who-email-smtp` and a mail host. |
| `who.passkey.rp-id` | The app's own host (`localhost` in development, `app.example.com` in production). Required. |
| `who.passkey.allowed-origins` | The origins passkey sign-in may come from. Defaults to `https://<rp-id>`, which does not match `http://localhost:8080`, so set it in development. |
| `who.security.public-paths` | Paths of the app open to signed-out requests besides who's sign-in endpoints and what roux opens (the shell, `/index.html`, and `/assets/**`, with a built frontend). Every page URL reaches the shell, so no page is listed; list only the files a signed-out browser loads from elsewhere, such as an icon at the root. Anything else answers `401` to a signed-out request. |
| `who.initialize-schema` | `never` with Liquibase, which then creates who's tables. |

Include who's changelog first in the app's Liquibase master changelog:

```yaml
databaseChangeLog:
  - include:
      file: classpath:org/jwcarman/who/db/who-changelog.xml
  - include:
      file: classpath:org/jwcarman/roux/theme/db/roux-theme-changelog.xml
```

(The second is roux-theme's table, below; include it when the app has `roux-theme`, which then does not start without it.) The full list of who's settings is in who's configuration guide
(`docs/guides/configuration.md` in who's repository, at tag `0.20.0`).

## Add the web side

```
npm install @jwcarman/roux-web@0.2.0
npm install @chakra-ui/react @emotion/react @tanstack/react-form @tanstack/react-query @tanstack/react-table date-fns react react-icons zod
```

The Java and web versions must match: use the same version for `roux.version` and `@jwcarman/roux-web`
(here `0.2.0`). The second line is the peer dependencies; the app supplies them (`react` `^19.3.1`,
`@chakra-ui/react` `^3.38.0`, `@tanstack/react-query` `^5.107.1`, `@tanstack/react-form` `^1.33.5`,
`@tanstack/react-table` `^8.21.3`, `date-fns` `^4.4.0`, `zod` `^4.6.7`, `@emotion/react` `^11.14.0`, `react-icons`
`^5.7.0`). The package is ESM only.

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
| `@jwcarman/roux-web/theme` | `ThemeProvider` (Chakra, the page's theme and the CSP nonce), `useShellTheme`, `createThemeSystem`, `AppearanceSettings` | [The shell](shell.md) |

## Set up the app root

`main.tsx` builds one query client with `createQueryClient()` and mounts, once each: the
`QueryClientProvider`, `ThemeProvider` (Chakra's provider with the app's theme, [The shell](shell.md)), `ConfirmProvider` (for `useConfirm`) around the app, and
`Toaster` (where `notify` toasts appear) beside it.

```tsx
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { ThemeProvider } from "@jwcarman/roux-web/theme";
import { SessionProvider } from "./session";
import { App } from "./App";

const queryClient = createQueryClient();

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

- Use `createQueryClient()`, never `new QueryClient()`: mutations' `meta.refreshes` only work with
  roux's client, and `useSchemaForm` and `useServerAction` throw when a mutation names
  `meta.refreshes` on another client. `createQueryClient(): QueryClient` takes no options.
- `Toaster` and `ConfirmProvider` render Chakra components, so they go inside `ThemeProvider`.
  `useConfirm` throws outside `ConfirmProvider`.
- Pass the same `queryClient` to TanStack Router's context if route loaders prefetch.

The session provider is app code (the template's `session.tsx`). It loads the caller from who, and it
must do two roux things: clear the query cache when the identity changes, and reload the caller when
an API call reports the session lost.

```tsx
import { createContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { onSessionLost, useClearQueriesOnIdentityChange } from "@jwcarman/roux-web/api";
import { fetchMe, type Me } from "./api";

interface Session {
  me: Me | null | undefined;
  refresh: () => Promise<Me | null>;
}

const SessionContext = createContext<Session | null>(null);

export function SessionProvider({ children }: { children: ReactNode }) {
  // undefined while loading, null when signed out
  const [me, setMe] = useState<Me | null | undefined>(undefined);
  useClearQueriesOnIdentityChange(me === undefined ? undefined : (me?.identityId ?? null));

  const refresh = useCallback(async () => {
    const current = await fetchMe();
    setMe(current);
    return current;
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Any /api call that answers 401: reload the caller, and the signed-out routes send them to sign in.
  useEffect(
    () =>
      onSessionLost(() => {
        void refresh();
      }),
    [refresh],
  );

  return <SessionContext value={{ me, refresh }}>{children}</SessionContext>;
}
```

`useClearQueriesOnIdentityChange(identityId: string | null | undefined): void` empties the query
cache when the identity goes away (`null`) or changes, so nobody sees rows cached for the previous
user; `undefined` (still loading) changes nothing. It must be called inside `QueryClientProvider`.
`fetchMe` is in [API client](api-client.md#get-the-raw-response).

## Point the client at the API

Nothing to do for a standard app. The client's defaults are `baseUrl` `/api`, `csrfBootstrapPath`
`/who/me` and `sessionPathPrefix` `/api/`, which match a roux server (who serves `/who/me`). Only if the API lives
elsewhere on the same origin, call `configureApi` once in `main.tsx` before rendering:

```ts
import { configureApi } from "@jwcarman/roux-web/api";

configureApi({ baseUrl: "/v2", sessionPathPrefix: "/v2/" });
```

and set the server's `roux.problems.api-path-prefix` to `/v2/` to match. Details in
[API client](api-client.md#change-where-the-api-lives).

## One origin

roux requires the SPA and the API to be served from one origin: the client calls relative paths
(`/api/...`), the session is a cookie, and CSRF reads a cookie the page can see. Two deployments are
supported:

1. **One jar (the default).** Spring Boot serves the built SPA from its static resources, and roux
   (with `static/index.html` on the classpath) answers any page URL with the shell: a GET or HEAD
   that accepts `text/html`, has no file extension and is not under `/api`, `/who`, `/assets`,
   `/actuator`, `/.well-known` or `/error`. Adding a page is adding its route file; the server has
   no list of pages, and an unknown URL gets the shell, whose not-found route answers it. The shell
   is open to signed-out visitors (with `/assets/**`, which roux also caches for a year), so a
   reload or a deep link opens the app, which sends the visitor to sign in. A fetch for JSON, an
   API path (a missing one is still a `404` problem) and a request for a file never get the shell.
   The filter is `SpaFallbackFilter` (in `roux-spa`, which switches it on by being on the class
   path: leave the jar out to turn it off); add paths it must leave alone (a server-rendered page) to
   `roux.spa.excluded-paths` (`RouxSpaProperties`). roux also serves the shell itself, with a
   nonce, a Content-Security-Policy and the theme in place ([The shell](#the-shell)), so an app
   writes no controller, header writer or `ErrorViewResolver` for it. An app with its own
   `SecurityFilterChain` must permit `/index.html` and `/assets/**`, which roux contributes with a
   `WhoPublicPathContributor` bean. who adds a contributor's paths to `who.security.public-paths`
   and every other contributor's, so an app that needs more public paths contributes its own bean
   the same way; it never replaces the `WhoPublicPaths` bean, which would drop every contribution.
2. **Edge routing.** Static hosting or a CDN serves the SPA, and a proxy on the same domain routes
   `/api` and `/who` to the app.

Separate origins (the SPA on one host calling the API on another, with CORS and cross-site cookies)
are not supported; `baseUrl` is a path, not a host. In development, Vite's dev server proxies the
server's paths to Spring Boot:

```ts
// vite.config.ts
import { defineConfig } from "vite";

const backend = "http://localhost:8080";

export default defineConfig({
  server: {
    proxy: {
      "/api": backend,
      "/who": backend,
    },
  },
});
```

Every who endpoint (`/who/me`, `/who/email/send`, `/who/logout`, `/who/passkey/sign-in`, and the signed-in person's own account under `/who/me/...`) is under
`/who`, so these two entries cover the app's API and its sign-in. Add an entry only for another
server path the app calls.

## The shell

roux serves `index.html` (`ShellRoutes`, from `roux-spa`; no code in the app). Each response is
the built page with three placeholders filled, `Cache-Control: no-store` (a stored copy's nonce
would not match the next response's policy) and its own `Content-Security-Policy` header. The
frontend build leaves the placeholders; the app does not start if one is missing (`ShellPage`
says which):

```html
<title>__APP_NAME__</title>
<script type="application/json" id="app-theme">__APP_THEME__</script>
```

and `html: { cspNonce: "__CSP_NONCE__" }` in `vite.config.ts`, which makes Vite write
`nonce="__CSP_NONCE__"` on every script and style tag it emits. The name is HTML-escaped into the
title; the theme is JSON with every `<` escaped, so nothing in it can end the element. One pass
fills them, so an app named `__APP_THEME__` shows that name.

**The policy** (`ContentSecurityPolicy.strict()`): `default-src 'self'`; `script-src` and
`style-src` `'self'` plus the response's nonce; `img-src 'self' data:`; `font-src`, `connect-src`,
`frame-src`, `media-src` and `form-action` `'self'`; `object-src 'none'`; `base-uri 'self'`;
`frame-ancestors 'none'`. It never holds `'unsafe-inline'` or `'unsafe-eval'`. To allow more,
add sources to a directive with `roux.spa.csp.<directive>` (`script-src`, `style-src`, `img-src`,
`font-src`, `connect-src`, `frame-src`, `media-src`, `form-action`; `RouxSpaProperties`):

```yaml
roux:
  spa:
    csp:
      img-src: https://images.example.com
      connect-src: https://api.example.com, wss://live.example.com
```

Sources are appended after the defaults, never replacing them. There is no setting for
`default-src`, `object-src`, `base-uri` or `frame-ancestors`, and a source that would loosen the
policy (`*`, `'unsafe-inline'`, `'unsafe-eval'`, a bare scheme such as `https:` for scripts or
styles, or anything holding a space, `;` or `,`) stops the app from starting with a message naming
the setting.

**The theme** (`ShellTheme`: `appName`, `palette`, `brandColor`, `shape`, `headingFont`,
`bodyFont`) comes from a `ShellThemeSource` bean, read for every page. Without one, roux reads
`roux.theme.*` (`RouxThemeProperties`): `app-name` (default `spring.application.name`; an app with
neither does not start), `palette` (`gray`), `brand-color` (`#3b82f6`), `shape` (`medium`),
`heading-font` and `body-font` (`standard`). A value the frontend has no look for (a palette
`mauve`) stops the app from starting. An app that keeps its look elsewhere declares its own
`ShellThemeSource` bean; `roux-theme` (owner-editable, in roux's own table) provides one.

### The owner's theme

`roux-theme` (added beside the starter) keeps the theme in roux's own table, `roux_theme`: one row, from the
changelog above, whose columns are null until the owner chooses (`roux.theme.*` stands for every part
not chosen, so the answer is always a whole theme). It brings:

- `GET /api/theme`, open to anyone, signed out too (the sign-in page needs its look): the whole
  theme and its `version`, 0 until the first save.
- `PUT /api/theme`, for whoever holds the `theme.manage` permission (`ThemeController.MANAGE`; grant
  it to the owner's role in who): a `ThemeRequest` with the `version` the owner read. A stale one is a
  `409`, a missing one a `400` on `version` (`Versions.require`). The values are the shell's own
  (`ShellTheme.PALETTES`, `SHAPES`, `FONTS`, `COLOR`): palette `gray|red|orange|yellow|green|teal|blue|cyan|purple|pink|brand`,
  shape `square|slight|medium|round|extra-round`, fonts `standard|modern|friendly|classic`, a
  `#rrggbb` colour (kept lower-case) and a name of 1 to 60 characters (stripped); a bad one is a
  `400` naming the field.
- the `ShellThemeSource` the shell reads (`OwnerShellTheme`), so a change shows on the next page
  load, for everyone.

The pieces behind them are `AppTheme` (the entity), `AppThemeRepository` and `ThemeService`, whose
`current()` answers a `ThemeResponse`: inject the service where the server needs the theme (an email
that carries the app's name, say).

An app that keeps its look elsewhere declares its own `ShellThemeSource` bean (the API stays); an
app that wants no owner theme leaves `roux-theme` out of its dependencies and does not include the
changelog. Entities and repositories are found without any entity
scan or `@EnableJpaRepositories` of the app's; an app that sets its own `@EnableJpaRepositories`
must still reach `org.jwcarman.roux.theme`.

`@jwcarman/roux-web` runs under this policy: `@jwcarman/roux-web/form` calls
`z.config({ jitless: true })` when it loads, so Zod never probes `eval`. The package's
`package.json` marks that file in `sideEffects` so bundlers keep it; do not override `sideEffects`
for the package or tree-shake it away.

## Things to know

- **who's chain is the app's security.** An app that defines no `SecurityFilterChain` gets who's:
  every sign-in method mounted, CSRF for the SPA, and `401` (no redirect) for a signed-out request
  outside `who.security.public-paths`. Defining any `SecurityFilterChain` makes who's back off; the
  app's own chain must then mount who with `WhoSecurity.all()` (see who's getting-started guide).
- **Audit dates follow the app's `Clock`.** With `@EnableJpaAuditing(auditorAwareRef = ...)` and a
  `Clock` bean, `@CreatedDate` and `@LastModifiedDate` are stamped from that clock (roux-jpa's
  `ClockDateTimeProvider`, registered for you), so a test that
  sets the clock sets them (an ordering by `created_date` can be tested without waiting). Write no
  `DateTimeProvider` and no `dateTimeProviderRef`; with no `Clock` bean the system clock is used.
  The same `Clock` is the one `@NotInFuture` reads ([Forms](forms.md#the-rule-helpers)).

## Next

- [Errors](errors.md): throwing errors on the server and showing them in the browser.
- [API client](api-client.md): one API module per resource.
- [Queries and mutations](queries-and-mutations.md), [Forms](forms.md),
  [Tables and paging](tables-and-paging.md), [Feedback](feedback.md), [Testing](testing.md).
