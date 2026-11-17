# Queries and mutations

A roux app reads and writes through TanStack Query. Each resource has one module holding its API
functions ([API client](api-client.md)), its queries (`queryOptions`) and its mutations
(`mutationOptions`); pages and forms use those, never the API functions directly. roux adds three
things to plain TanStack Query: a query client that does not retry a refusal, `meta.refreshes` on a
mutation (the queries to refetch once it is answered), and `useServerAction` for a button that runs a
mutation. Forms run mutations through `useSchemaForm` ([Forms](forms.md)).

## Set up the query client

```ts
function createQueryClient(): QueryClient;
function shouldRetry(failureCount: number, error: unknown): boolean;
```

Build the app's one client with `createQueryClient()` in `main.tsx` (see
[Getting started](getting-started.md#set-up-the-app-root)); never `new QueryClient()`. It takes no
options. What it sets:

- Queries retry with `shouldRetry`: an `ApiError` with a status under 500 (a 4xx) is not retried,
  because asking again gets the same answer and a 401 already sends the user to sign in; anything else
  (a 5xx, a network failure) is retried twice. Mutations are not retried (TanStack's default).
- A mutation's `meta.refreshes` is honoured (below). `useSchemaForm` and `useServerAction` throw
  `meta.refreshes needs roux's query client: use createQueryClient() from @jwcarman/roux-web/api` when
  a mutation names `meta.refreshes` and the client is not roux's.

`shouldRetry` is exported for a query that sets its own `retry` and wants roux's rule underneath it.

## Name the query keys

All keys come from one factory, `src/queryKeys.ts`, so related queries share a prefix and one key
refreshes them all:

```ts
/** The app's query keys, built in one place so related queries share a prefix. */
export const queryKeys = {
  ranks: {
    all: ["ranks"] as const,
    lists: () => [...queryKeys.ranks.all, "list"] as const,
    detail: (id: string) => [...queryKeys.ranks.all, "detail", id] as const,
  },
  students: {
    all: ["students"] as const,
    lists: () => [...queryKeys.students.all, "list"] as const,
    list: (filters: { search?: string; status?: string; rankId?: string }) =>
      [...queryKeys.students.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.students.all, "detail", id] as const,
  },
};
```

A key matches every key it is a prefix of: `queryKeys.students.lists()` matches each
`queryKeys.students.list(filters)`, whatever the filters.

## Write a resource module

One file per resource, in its feature folder (`src/ranks/ranks.ts`): the request's schema, the API
functions, the queries and the mutations. Everything the pages and forms need is imported from here.

```ts
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** The belt colours a rank can have: the server's BeltColour enum. */
export const BELT_COLOURS = ["WHITE", "YELLOW", "ORANGE", "GREEN", "BLUE", "BROWN", "BLACK"] as const;
export type BeltColour = (typeof BELT_COLOURS)[number];

/** A rank as `/api/ranks` answers it. */
export interface Rank {
  id: string;
  name: string;
  colour: BeltColour;
  version: number;
}

/** RankRequest's rules (without the version), in the server's words. */
export const rankRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(BELT_COLOURS),
});

/** What a rank form sends: the name trimmed, the colour chosen. */
export type RankRequest = z.output<typeof rankRequestSchema>;

/** `/api/ranks`: one function per endpoint. */
export const ranksApi = {
  list: (signal?: AbortSignal) => getJson<Rank[]>("ranks", { signal }),
  get: (id: string, signal?: AbortSignal) => getJson<Rank>(path`ranks/${id}`, { signal }),
  create: (request: RankRequest) => sendJson<Rank>("POST", "ranks", request),
  update: (id: string, request: RankRequest & { version: number }) =>
    sendJson<Rank>("PUT", path`ranks/${id}`, request),
  remove: (id: string) => sendJson<void>("DELETE", path`ranks/${id}`),
};

/** Every rank, for the ranks page and the rank pickers. */
export const ranksQuery = queryOptions({
  queryKey: queryKeys.ranks.lists(),
  queryFn: ({ signal }) => ranksApi.list(signal),
});

/** A rank, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function rankQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.ranks.detail(id),
    queryFn: ({ signal }) => ranksApi.get(id, signal),
  });
}

/** Adds a rank; the rank list refreshes. */
export const createRank = mutationOptions({
  mutationFn: (request: RankRequest) => ranksApi.create(request),
  meta: { refreshes: [queryKeys.ranks.lists()] },
});

/** Saves a rank at the `version` it was read at; a change made since answers 409. */
export const updateRank = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: RankRequest) => ranksApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.ranks.detail(id), queryKeys.ranks.lists()] },
  });

/** Removes a rank; the rank list refreshes. */
export const removeRank = mutationOptions({
  mutationFn: (id: string) => ranksApi.remove(id),
  meta: { refreshes: [queryKeys.ranks.lists()] },
});
```

The rules this module follows:

- A query is a `queryOptions(...)` constant, or a function of its parameters when it has some
  (`rankQuery(id)`). The `queryFn` passes `signal` on, so a query that is no longer needed is
  cancelled.
- A mutation is a `mutationOptions(...)` constant, or a function when it needs values the request
  does not carry: the id in the path and the `version` the record was read at (`updateRank(id,
  version)`). Its `mutationFn` takes the schema's output (`RankRequest`), which is what
  `useSchemaForm` submits.
- Every mutation that changes what a query shows names that query in `meta.refreshes`.
- A paged list (a `QueryTable`'s query) has the shape `{ queryKey, query }`; see
  [Tables and paging](tables-and-paging.md).

## Read data in a page

Use the module's queries with TanStack's hooks:

```tsx
import { List, Spinner, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ranksQuery } from "./ranks";

/** The school's ranks, in order. */
export function RankList() {
  const ranks = useQuery(ranksQuery);
  if (ranks.isPending) {
    return <Spinner aria-label="Loading" />;
  }
  if (ranks.isError) {
    return <Text>The ranks could not be loaded. Try again in a moment.</Text>;
  }
  return (
    <List.Root>
      {ranks.data.map((rank) => (
        <List.Item key={rank.id}>{rank.name}</List.Item>
      ))}
    </List.Root>
  );
}
```

For a detail page, the route's `loader` fetches first with
`await context.queryClient.ensureQueryData(rankQuery(params.rankId))` (pass the app's `queryClient` in
the router's context), and the page reads it with `useSuspenseQuery(rankQuery(rankId))`, so it renders
with data at once. A missing record rejects with an `ApiError` whose `status` is 404: catch it in the
loader and `throw notFound()`, and give the route a `notFoundComponent` (`NotFoundPage` from
`/feedback`, see [Feedback](feedback.md)). Any other failed query rejects with its `ApiError`
([Errors](errors.md#in-the-browser-reading-a-problem)).

## Refresh queries after a mutation

```ts
mutationOptions({
  mutationFn: (request: RankRequest) => ranksApi.update(id, { ...request, version }),
  meta: { refreshes: [queryKeys.ranks.detail(id), queryKeys.ranks.lists()] },
});
```

`meta.refreshes` is a list of query keys (`readonly QueryKey[]`; roux types it on TanStack's
`Register`, so no cast is needed). Once the mutation is answered, roux's query client invalidates each
key (TanStack's `invalidateQueries`: every matching query goes stale, and those on screen refetch), and
the mutation's promise settles only after those refetches. Specifically:

- **After success and after a refusal.** A refusal means the server's state is not what the page
  showed (someone else saved, removed, or took the name), so the page must catch up either way. A 409
  on a form needs this: the refreshed record is what the form starts over from
  ([Forms](forms.md#versions-and-409-conflicts)).
- **Awaited.** A form stays submitting, and `useServerAction`'s `run` stays out, until the refetches
  are done, so a dialog closes onto a list that already shows the change and the next save goes at the
  new `version`.
- A refetch that fails does not fail the mutation: a successful save stays successful.

What to name: the record's own key (`detail(id)`) and the lists that show it (`lists()`, which covers
every filter). Name nothing else; a query not on screen refetches when it is next used.

Do not call `queryClient.invalidateQueries` in an `onSuccess` instead: it would miss refusals, and the
form would not wait for it. For data that is not in a query (the template's session profile, held in
React state), give the mutation its own `onSettled` that reloads it and returns the promise, as
TanStack awaits it too:

```ts
mutation: { ...renameMe(profile.version), onSettled: () => refreshProfile() },
```

## Run a mutation from a button

A button that changes something on the server (remove, promote, archive) runs its mutation with
`useServerAction`. It takes the mutation and `ServerActionOptions`, and returns a `ServerAction`:

```ts
function useServerAction<TData, TVariables = void>(
  mutation: UseMutationOptions<TData, Error, TVariables>,
  options?: ServerActionOptions<TData, TVariables>,
): ServerAction<TVariables>;

interface ServerActionOptions<TData, TVariables> {
  /** The toast title when the request is refused. Defaults to `Could not save`. */
  failure?: string | ((variables: TVariables) => string);
  /** Runs once the request succeeds: a success toast, closing a dialog. */
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}

interface ServerAction<Variables> {
  /** Sends the request; true when it succeeded. A refusal has already been shown to the user. */
  run: (variables: Variables) => Promise<boolean>;
  /** Whether a request is out, for a button's loading state. */
  pending: boolean;
}
```

```tsx
import { Button } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { removeRank, type Rank } from "./ranks";

/** Remove, after asking; a rank still held by students is refused by the server (409). */
export function RemoveRankButton({ rank }: { rank: Rank }) {
  const confirm = useConfirm();
  const { run, pending } = useServerAction(removeRank, {
    failure: `Could not remove ${rank.name}`,
    onSuccess: () => notify.success(`${rank.name} was removed`),
  });

  async function onRemove() {
    if (await confirm(removal(`Remove ${rank.name}?`, "It will be removed from the list."))) {
      await run(rank.id);
    }
  }

  return (
    <Button variant="outline" loading={pending} onClick={onRemove}>
      Remove
    </Button>
  );
}
```

What it does:

- A refusal is toasted: `failure` as the title, the server's `detail` under it (and
  `Reference: <errorId>` for a 500). A lost session (401) shows nothing; a network failure shows
  `failure` alone. `run` resolves `false`; it never rejects for a refusal. The full table is in
  [Errors](errors.md#in-the-browser-what-the-user-sees).
- `failure` can be a function of the variables, for a title that names what was acted on:
  ``failure: ({ action }) => `Could not ${action} ${member.displayName}` ``.
- `options.onSuccess` runs after the mutation's own `onSuccess`, and before the `meta.refreshes`
  refetches; `run` resolves `true` after them. The mutation's own `onError` still runs too.
- `pending` is true while the request (and its refreshes) is out; put it on the button's `loading`.
- Variables can carry more than the request needs, for the toast: type the hook
  (`useServerAction<MemberDetail, StatusChange>(...)`) and let `mutationFn` take only its part.

A form's save is not a button: use `useSchemaForm`, which also places field errors
([Forms](forms.md)).

## Don't

- Don't create a `QueryClient` yourself, in the app or in a test's provider; use
  `createQueryClient()`.
- Don't call API functions from components or event handlers; call a mutation through
  `useSchemaForm` or `useServerAction`, and read through a query.
- Don't write query keys inline; add them to `queryKeys`.
- Don't refresh by hand (`invalidateQueries`, `refetch`) after a mutation; name the keys in
  `meta.refreshes`.
- Don't catch a mutation's error to toast it; `useServerAction` and `useSchemaForm` already do.
