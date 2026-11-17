# Getting started

roux is the base a Spring Boot + React application is built on: a Java starter that answers every
API error as a Problem Detail, and a web package (`@jwcarman/roux-web`) with the matching API client,
paging, tables, forms and feedback. This guide adds both to an app and wires the app root. After it,
features use roux by importing from it; no plumbing is written in the app.

## Requirements

roux supports one stack and nothing else:

- Java 25, Spring Boot 4.1 (`spring-boot-starter-parent` 4.1.x), Maven.
- PostgreSQL with Liquibase; jpa-utils for paging.
- who for identity (optional, but the API client's defaults assume it).
- React 19, Chakra UI v3, TanStack Router, Query, Form and Table, Zod 4.
- Vitest with MSW, and Playwright, for tests.

## Add the Java side

Import `roux-bom` and depend on `roux-spring-boot-starter`. Keep Spring Boot's parent as the app's
parent: `roux-bom` does not import Spring Boot's BOM, so Spring Boot's managed versions stay the
parent's.

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
    <!-- identity (optional): its version comes from roux-bom, which imports who's BOM -->
    <dependency>
        <groupId>org.jwcarman.who</groupId>
        <artifactId>who-spring-boot-starter</artifactId>
    </dependency>
</dependencies>
```

The starter brings `roux-problems`, `roux-autoconfigure`, jpa-utils (`org.jwcarman.jpa:jpa-utils`),
`spring-boot-starter-validation` and `spring-boot-starter-webmvc`. Do not declare versions for any of
them, for who's modules, or for jpa-utils: `roux-bom` pins who 0.15.0 and jpa-utils 0.2.0.

That is all the Java setup. Errors are answered as Problem Details from the first request; see
[Errors](errors.md). The settings, both optional, are under `roux.problems` (`enabled`,
`api-path-prefix`).

## Add the web side

```
npm install @jwcarman/roux-web
npm install @chakra-ui/react @emotion/react @tanstack/react-form @tanstack/react-query @tanstack/react-table react react-icons zod
```

The second line is the peer dependencies; the app supplies them (`react` `^19.3.1`,
`@chakra-ui/react` `^3.38.0`, `@tanstack/react-query` `^5.107.1`, `@tanstack/react-form` `^1.33.5`,
`@tanstack/react-table` `^8.21.3`, `zod` `^4.6.7`, `@emotion/react` `^11.14.0`, `react-icons`
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

## Set up the app root

`main.tsx` builds one query client with `createQueryClient()` and mounts, once each: the
`QueryClientProvider`, Chakra's provider, `ConfirmProvider` (for `useConfirm`) around the app, and
`Toaster` (where `notify` toasts appear) beside it.

```tsx
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { SessionProvider } from "./session";
import { App } from "./App";

const queryClient = createQueryClient();

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ChakraProvider value={defaultSystem}>
        <ConfirmProvider>
          <SessionProvider>
            <App />
          </SessionProvider>
        </ConfirmProvider>
        <Toaster />
      </ChakraProvider>
    </QueryClientProvider>
  </StrictMode>,
);
```

- Use `createQueryClient()`, never `new QueryClient()`: mutations' `meta.refreshes` only work with
  roux's client, and `useSchemaForm` and `useServerAction` throw when a mutation names
  `meta.refreshes` on another client. `createQueryClient(): QueryClient` takes no options.
- `Toaster` and `ConfirmProvider` render Chakra components, so they go inside `ChakraProvider`.
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
`/who/me` and `sessionPathPrefix` `/api/`, which match a roux server with who. Only if the API lives
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

1. **One jar (the default).** Spring Boot serves the built SPA from its static resources. In the
   template this is app code (`SpaController` and `ShellController`), not part of roux.
2. **Edge routing.** Static hosting or a CDN serves the SPA, and a proxy on the same domain routes
   `/api` (and who's paths) to the app.

Separate origins (the SPA on one host calling the API on another, with CORS and cross-site cookies)
are not supported; `baseUrl` is a path, not a host. In development, Vite's dev server proxies the
server's paths to Spring Boot:

```ts
// vite.config.ts
const backend = "http://localhost:8080";

export default defineConfig({
  server: {
    proxy: {
      "/api": backend,
      "/who": backend,
      "/login": backend,
      "/logout": backend,
    },
  },
});
```

Add a proxy entry for every other server path the app calls (the template also proxies `/ott` and
`/webauthn` for who's sign-in).

## Content-Security-Policy

`@jwcarman/roux-web/form` calls `z.config({ jitless: true })` when it loads, so Zod never probes
`eval` and a Content-Security-Policy without `unsafe-eval` raises no violation. The package's
`package.json` marks that file in `sideEffects` so bundlers keep it; do not override `sideEffects`
for the package or tree-shake it away.

## Next

- [Errors](errors.md): throwing errors on the server and showing them in the browser.
- [API client](api-client.md): one API module per resource.
- [Queries and mutations](queries-and-mutations.md), [Forms](forms.md),
  [Tables and paging](tables-and-paging.md), [Feedback](feedback.md), [Testing](testing.md).
