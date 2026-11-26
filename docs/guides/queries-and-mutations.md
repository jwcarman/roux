# Queries and mutations

!!! note "Surfaces"
    A surface's binding runs its queries and commands itself, through this client and TanStack Query
    ([Surfaces](surfaces.md)): a feature's screen writes no resource module. This guide is the layer
    roux's built-in pages and the surface runtime are built on.

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
  labels: {
    all: ["labels"] as const,
    lists: () => [...queryKeys.labels.all, "list"] as const,
    detail: (id: string) => [...queryKeys.labels.all, "detail", id] as const,
  },
  items: {
    all: ["items"] as const,
    lists: () => [...queryKeys.items.all, "list"] as const,
    list: (filters: { search?: string; status?: string; assignee?: string }) =>
      [...queryKeys.items.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.items.all, "detail", id] as const,
  },
};
```

A key matches every key it is a prefix of: `queryKeys.items.lists()` matches each
`queryKeys.items.list(filters)`, whatever the filters.

## Write a resource module

One file per resource, in its feature folder (`src/labels/labels.ts`): the request's schema, the API
functions, the queries and the mutations. Everything the pages and forms need is imported from here.

```ts
import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { oneOf, text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** The colours a label can have: the server's Colours (Chakra UI's palette names). */
export const LABEL_COLOURS = ["gray", "red", "orange", "yellow", "green", "teal", "blue", "purple", "pink"] as const;
export type LabelColour = (typeof LABEL_COLOURS)[number];

/** A label as `/api/labels` answers it. */
export interface Label {
  id: string;
  name: string;
  colour: LabelColour;
  version: number;
}

/** LabelRequest's rules (without the version), in the server's words. */
export const labelRequestSchema = z.object({
  name: text().max(40),
  colour: oneOf(LABEL_COLOURS),
});

/** What a label form sends: the name trimmed, the colour chosen. */
export type LabelRequest = z.output<typeof labelRequestSchema>;

/** `/api/labels`: one function per endpoint. */
export const labelsApi = {
  list: (signal?: AbortSignal) => getJson<Label[]>("labels", { signal }),
  get: (id: string, signal?: AbortSignal) => getJson<Label>(path`labels/${id}`, { signal }),
  create: (request: LabelRequest) => sendJson<Label>("POST", "labels", request),
  update: (id: string, request: LabelRequest & { version: number }) =>
    sendJson<Label>("PUT", path`labels/${id}`, request),
  remove: (id: string) => sendJson<void>("DELETE", path`labels/${id}`),
};

/** Every label, for the labels page and the label pickers. */
export const labelsQuery = queryOptions({
  queryKey: queryKeys.labels.lists(),
  queryFn: ({ signal }) => labelsApi.list(signal),
});

/** A label, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function labelQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.labels.detail(id),
    queryFn: ({ signal }) => labelsApi.get(id, signal),
  });
}

/** Adds a label; the label list refreshes. */
export const createLabel = mutationOptions({
  mutationFn: (request: LabelRequest) => labelsApi.create(request),
  meta: { refreshes: [queryKeys.labels.lists()] },
});

/** Saves a label at the `version` it was read at; a change made since answers 409. */
export const updateLabel = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: LabelRequest) => labelsApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.labels.detail(id), queryKeys.labels.lists()] },
  });

/** Removes a label; the label list refreshes. */
export const removeLabel = mutationOptions({
  mutationFn: (id: string) => labelsApi.remove(id),
  meta: { refreshes: [queryKeys.labels.lists()] },
});
```

The rules this module follows:

- A query is a `queryOptions(...)` constant, or a function of its parameters when it has some
  (`labelQuery(id)`). The `queryFn` passes `signal` on, so a query that is no longer needed is
  cancelled.
- A mutation is a `mutationOptions(...)` constant, or a function when it needs values the request
  does not carry: the id in the path and the `version` the record was read at (`updateLabel(id,
  version)`). Its `mutationFn` takes the schema's output (`LabelRequest`), which is what
  `useSchemaForm` submits.
- Every mutation that changes what a query shows names that query in `meta.refreshes`.
- A paged list (for `QueryTable`, `InfiniteList` or `InfiniteSelect`) is a function of its filters
  that returns `pageQuery(queryKeys.items.list(filters), (params, signal) => ...)`: its key and
  how to fetch one page, passing `signal` on. A short list for `SimpleQueryTable` is a plain
  `queryOptions(...)` constant. See [Tables and paging](tables-and-paging.md).

## Read data in a page

Use the module's queries with TanStack's hooks:

```tsx
import { List, Spinner, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { labelsQuery } from "./labels";

/** The team's labels. */
export function LabelList() {
  const labels = useQuery(labelsQuery);
  if (labels.isPending) {
    return <Spinner aria-label="Loading" />;
  }
  if (labels.isError) {
    return <Text>The labels could not be loaded. Try again in a moment.</Text>;
  }
  return (
    <List.Root>
      {labels.data.map((label) => (
        <List.Item key={label.id}>{label.name}</List.Item>
      ))}
    </List.Root>
  );
}
```

For a detail page, the route's `loader` fetches first with
`await context.queryClient.ensureQueryData(labelQuery(params.labelId))` (pass the app's `queryClient` in
the router's context), and the page reads it with `useSuspenseQuery(labelQuery(labelId))`, so it renders
with data at once. A missing record rejects with an `ApiError` whose `status` is 404: catch it in the
loader and call `notFound({ throw: true })` (it throws for you, so lint sees no non-Error thrown), and give the route a `notFoundComponent` (`NotFoundPage` from
`/feedback`, see [Feedback](feedback.md)). Any other failed query rejects with its `ApiError`
([Errors](errors.md#in-the-browser-reading-a-problem)).

## Refresh queries after a mutation

```ts
mutationOptions({
  mutationFn: (request: LabelRequest) => labelsApi.update(id, { ...request, version }),
  meta: { refreshes: [queryKeys.labels.detail(id), queryKeys.labels.lists()] },
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

A button that changes something on the server (remove, reopen, archive) runs its mutation with
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
import { removeLabel, type Label } from "./labels";

/** Remove, after asking; a label items still carry is refused by the server (409). */
export function RemoveLabelButton({ label }: { label: Label }) {
  const confirm = useConfirm();
  const { run, pending } = useServerAction(removeLabel, {
    failure: `Could not remove ${label.name}`,
    onSuccess: () => notify.success(`${label.name} was removed`),
  });

  async function onRemove() {
    if (await confirm(removal(`Remove ${label.name}?`, "It will be removed from the list."))) {
      await run(label.id);
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

## A control that saves on change

A toggle, a switch, a rating, a row's dropdown or a reorder button saves the moment it changes, so it
should show the change at once and still end up showing what the server holds. That is
`optimisticMutation` with `useOptimisticToggle` (a boolean) or `useOptimisticValue` (any value), from
`@jwcarman/roux-web/api`. Do not build it from `onMutate` plus `setQueryData`: `meta.refreshes`
refetches after every answer, so the first answer overwrites the guess while a queued second change is
still waiting, and the control flickers back.

```ts
function optimisticMutation<TData, TVariables>(
  key: MutationKey, // names the control: one per thing it changes
  options: OptimisticMutationOptions<TData, TVariables>, // mutationFn, and meta.refreshes (required, at least one key)
): OptimisticMutation<TData, TVariables>;

function useOptimisticValue<TData, TVariables>(
  mutation: OptimisticMutation<TData, TVariables>,
  serverValue: TVariables, // what the query holds
  options?: OptimisticOptions<TData, TVariables>, // { failure } as useServerAction's
): [shown: TVariables, set: (value: TVariables) => Promise<boolean>];

function useOptimisticToggle<TData>(
  mutation: OptimisticMutation<TData, boolean>,
  serverValue: boolean,
  options?: OptimisticOptions<TData, boolean>,
): [shown: boolean, toggle: () => Promise<boolean>];
```

```ts
// items.ts: the key names this item's done mark; the mutation sends the wanted state
export const markDone = (itemId: string) =>
  optimisticMutation(queryKeys.items.done(itemId), {
    mutationFn: (done: boolean) => itemsApi.markDone(itemId, { done }),
    meta: { refreshes: [queryKeys.items.detail(itemId), queryKeys.items.lists()] },
  });
```

```tsx
function DoneToggle({ item }: { item: ItemRow }) {
  const [done, toggle] = useOptimisticToggle(
    markDone(item.id),
    item.done, // from the list's query
    { failure: `Could not mark ${item.title}` },
  );
  return (
    <Checkbox.Root checked={done} onCheckedChange={() => void toggle()}>
      <Checkbox.HiddenInput />
      <Checkbox.Control />
      <Checkbox.Label>{item.title}</Checkbox.Label>
    </Checkbox.Root>
  );
}
```

The types, for annotating your own helpers: `OptimisticMutation<TData, TVariables>` (what
`optimisticMutation` returns), `OptimisticMutationOptions<TData, TVariables>` (what it takes) and
`OptimisticOptions<TData, TVariables>` (the hooks' `{ failure }`).

What it does:

- `optimisticMutation` sets the mutation's `mutationKey` to `key` and its `scope` from it, so the
  control's saves reach the server one at a time, in the order they were made, and the hook finds the
  control's pending value. Nothing for the module to forget: the hooks take only what it made (a plain
  `mutationOptions` is a type error), and `meta.refreshes` is required, so the control goes back to
  the query's value when the saves settle.
- `shown` is the variables of the control's latest save still waiting for the server, else
  `serverValue`. After a refusal, the toast says why (`failure`, the server's `detail` under it, as
  `useServerAction` does) and `shown` is the server's value again. `set` and `toggle` answer whether
  the save succeeded.
- Two taps in the same instant (a double tap, before React has shown the first) are not lost:
  `toggle()` asks for the opposite of what was last asked, not of what is rendered, so a quick
  double tap sends `true` then `false`.
- Send the wanted value (`done: boolean`), never "flip it": the server then answers a repeat the
  same way, and a request that is retried is harmless.
- `key` must be as specific as the thing the control changes (this item's done mark), or two
  controls share a queue and a pending value.
- Leaving the page drops the saves still queued: each waits for the one before it to be answered and
  refetched. Fine for a toggle; a control that must not lose a change is not this.

What fits: a control with one value that saves on change and is shown again from a query (toggles,
switches, ratings, a row's dropdown, reorder). What does not: a form with a Save button
(`useSchemaForm`), a create (there is nothing to show yet), a value the server computes (it would
show a guess), and typing into a field continuously (a request per keystroke: debounce it, or
make it a form).

## Don't

- Don't create a `QueryClient` yourself, in the app or in a test's provider; use
  `createQueryClient()`.
- Don't call API functions from components or event handlers; call a mutation through
  `useSchemaForm` or `useServerAction`, and read through a query.
- Don't write query keys inline; add them to `queryKeys`.
- Don't refresh by hand (`invalidateQueries`, `refetch`) after a mutation; name the keys in
  `meta.refreshes`.
- Don't catch a mutation's error to toast it; `useServerAction` and `useSchemaForm` already do.
