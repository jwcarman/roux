# API client

`@jwcarman/roux-web/api` is a thin layer over `fetch` for calling the app's own Spring API: relative
paths under `/api`, the session cookie, Spring Security's CSRF header on every write, and every
refusal turned into an `ApiError` carrying the server's Problem Detail. An app writes one API module
per resource, one typed function per endpoint, and calls those functions from TanStack Query
(`queryFn`, `mutationFn`); pages never call `fetch` directly. Query and mutation wiring
(`createQueryClient`, `useServerAction`) is in [Queries and mutations](queries-and-mutations.md).

## Write an API module for a resource

One file per resource, exporting one object whose members are the endpoints. This is the template's
`customers.ts` shape, for students:

```ts
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import type { PageDto, PageParams } from "@jwcarman/roux-web/paging";

/** The student list's filters, as `/api/students` takes them. */
export type StudentFilters = { search?: string; status?: StudentStatus; rankId?: string };

/** `/api/students`: one function per endpoint. */
export const studentsApi = {
  list: (params: PageParams & StudentFilters, signal?: AbortSignal) =>
    getJson<PageDto<Student>>("students", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<StudentDetail>(path`students/${id}`, { signal }),
  create: (request: StudentRequest) => sendJson<StudentDetail>("POST", "students", request),
  update: (id: string, request: StudentRequest & { version: number }) =>
    sendJson<StudentDetail>("PUT", path`students/${id}`, request),
  promote: (id: string, rankId: string) => sendJson<StudentDetail>("POST", path`students/${id}/promotions`, { rankId }),
  remove: (id: string) => sendJson<void>("DELETE", path`students/${id}`),
};
```

Rules the module follows:

- Paths have no leading slash (`"students"`), so they go under `baseUrl` (`/api`).
- Every path with a value in it uses the `path` tagged template, which URL-encodes each value.
- Reads take an optional `signal` and pass it on, so TanStack Query can cancel them
  (`queryFn: ({ signal }) => studentsApi.get(id, signal)`).
- Each function is typed by its answer: `getJson<T>`, `sendJson<T>`.

## Read JSON

```ts
function getJson<T>(path: string, options?: RequestOptions): Promise<T>;

interface RequestOptions {
  params?: QueryParams;
  signal?: AbortSignal;
}
```

`RequestOptions` is the options object of `get` and `getJson`. `getJson` sends `GET` with `Accept: application/json` and the session cookie (`credentials:
"same-origin"`), parses the body as `T`, and rejects with an `ApiError` on any non-2xx answer. The
type argument is not checked at run time.

## Call an endpoint with query parameters

Pass `params`; any object type works (`QueryParams` is `object`), including an interface such as
`PageParams`, so a page's parameters and filters can be spread together:

```ts
getJson<PageDto<Student>>("students", { params: { pageIndex: 0, pageSize: 25, search: "ada", rankId: undefined } });
// GET /api/students?pageIndex=0&pageSize=25&search=ada
```

Values may be strings, numbers, booleans, or arrays of them. `null` and `undefined` are left out; an
array repeats its key (`{ rank: ["white", "yellow"] }` becomes `rank=white&rank=yellow`). If the path
already has a `?`, the parameters are appended with `&`.

## Put a value in a path

```ts
function path(strings: TemplateStringsArray, ...values: (string | number)[]): string;
```

```ts
path`students/${id}/promotions`; // each ${} is encodeURIComponent'd
```

Never build a path with a plain template literal or `+`: an id with a `/` or `?` would change the
request.

## Send a write

```ts
function sendJson<T>(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<T>;
```

`sendJson` adds the CSRF header, serializes `body` as JSON (with `Content-Type: application/json`)
when there is one, and parses the answer as `T`. An answer without a body (a 204, a 201 with only a
`Location`, a bare 200) resolves `undefined`, so type such endpoints `sendJson<void>`. It rejects with
an `ApiError` on any non-2xx answer.

## Get the raw Response

`get` and `send` are the same calls without the status check or parsing: they resolve the `Response`
whatever its status, and never reject on a 4xx or 5xx.

```ts
function get(path: string, options?: RequestOptions): Promise<Response>;
function send(method: "POST" | "PUT" | "PATCH" | "DELETE", path: string, body?: unknown): Promise<Response>;
```

Use them only when the status itself is the answer:

```ts
/** Whether the export is ready: 204 until it is, 200 once it is. */
export async function exportReady(id: string): Promise<boolean> {
  const response = await get(`exports/${id}`);
  return response.status === 200;
}

// For who's own endpoints, prefer who's typed client, @jwcarman/who-client: `who.me.get()`,
// `who.email.send(address)`, `who.me.passkeys.list()`, `who.signOut()`. It handles who's CSRF
// cookie and answers a typed result instead of a status.
```

To turn a failed `Response` into a problem yourself, use `problemOf` from `/problem` (see
[Errors](errors.md)).

## Call a path outside the API

A path that starts with `/` is used as it is, not put under `baseUrl`: `get("/who/me")`,
`send("POST", "/who/logout")`. Use this for a who endpoint the client does not cover (all under `/who`); `@jwcarman/who-client` is the way to call the ones it does. Keep the app's own
endpoints under `/api` and call them without the slash.

## Handle a refused call

`getJson` and `sendJson` reject with `ApiError`:

```ts
class ApiError extends Error {
  readonly status: number;
  readonly problem: Problem; // the server's Problem Detail, or a blank one built from status
}
```

Most code never catches it: `useSchemaForm` and `useServerAction` show the refusal, and a failed query
puts it in the query's `error`. When you do catch, branch on `status` and show
`problem.detail`:

```ts
import { ApiError, isSessionLost } from "@jwcarman/roux-web/api";
import { notify } from "@jwcarman/roux-web/feedback";

try {
  await studentsApi.promote(id, rankId);
} catch (error) {
  if (isSessionLost(error)) return; // the session provider is already sending the user to sign in
  if (error instanceof ApiError && error.status === 409) {
    notify.problem(error.problem, "Could not promote");
    return;
  }
  throw error;
}
```

A network failure (no answer at all) rejects with `fetch`'s own `TypeError`, not an `ApiError`.

## Notice a lost session

```ts
function isSessionLost(error: unknown): boolean; // an ApiError with status 401
function onSessionLost(listener: () => void): () => void; // returns the unsubscribe function
```

Any call whose URL starts with `sessionPathPrefix` (`/api/` by default) and answers 401 calls every
`onSessionLost` listener. A 401 from `/who/me` does not: that is how a signed-out page learns it is
signed out. Register one listener, in the session provider, that reloads the caller; the signed-out
routes then send the user to sign in:

```tsx
useEffect(
  () =>
    onSessionLost(() => {
      void refresh();
    }),
  [refresh],
);
```

Pages need not handle 401 themselves. Where a page catches errors, skip the lost session with
`if (!isSessionLost(error))` so it does not show a second message.

## CSRF

Writes need no CSRF code in the app. Before every `send`/`sendJson`, the client reads the
`XSRF-TOKEN` cookie; if it is missing it first `GET`s `csrfBootstrapPath` (`/who/me` by default) to
get one, then sends the token as the `X-XSRF-TOKEN` header. The cookie is read afresh on every call,
because sign-in and sign-out rotate or clear it. `get` and `getJson` send no CSRF header.

This relies on who's CSRF setup: the cookie `XSRF-TOKEN`, the header `X-XSRF-TOKEN`, and the
bootstrap from `/who/me`. The names are fixed in the client.

## Change where the API lives

```ts
interface ApiSettings {
  baseUrl: string; // default "/api": where a path without a leading slash goes
  csrfBootstrapPath: string; // default "/who/me": called before the first write to get the CSRF cookie
  sessionPathPrefix: string; // default "/api/": the paths whose 401 means the session is lost
}

function configureApi(settings: Partial<ApiSettings>): void; // changes the named settings, keeps the rest
function apiSettings(): ApiSettings; // a copy of the settings in force
```

`configureApi` merges a partial `ApiSettings` into the current ones; `apiSettings()` returns a copy
of the settings in force (useful in tests). The defaults match a roux server; most apps never call
`configureApi`. If the API moves, move
`sessionPathPrefix` with `baseUrl`, and the server's `roux.problems.api-path-prefix` with them:

```ts
configureApi({ baseUrl: "/v2", sessionPathPrefix: "/v2/" });
```

Call it once, in `main.tsx`, before the first request. `baseUrl` is a path on the same origin, not a
different host: roux's session and CSRF handling need the SPA and the API on one origin (see
[Getting started](getting-started.md#one-origin)).

## Don't

- Don't call `fetch` (or axios) for the app's API: you lose CSRF, `ApiError`, and the session-lost
  notice.
- Don't call API functions from components directly; call them from TanStack Query options and
  mutations ([Queries and mutations](queries-and-mutations.md)).
- Don't hand-build query strings; pass `params`.
