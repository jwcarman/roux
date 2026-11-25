# Feedback

`@jwcarman/roux-web/feedback` is how a roux app tells the user what happened: a toast for the outcome
of an action (`notify`), a confirmation before an action with consequences (`useConfirm`), an inline
alert for something on the page that failed (`ErrorMessage`), and the pages for an address that leads
nowhere (`NotFoundPage`) and a page that failed (`ErrorPage`). A field's mistake is not feedback: it
stays under the field ([Forms](forms.md)).

## Mount it once

`main.tsx` mounts `Toaster` (where toasts appear) and `ConfirmProvider` (the one confirmation dialog),
both inside Chakra's provider; see [Getting started](getting-started.md#set-up-the-app-root). Nothing
else is set up.

## Tell the user how an action went

```ts
const notify: {
  success(title: string, action?: { label: string; onClick: () => void }): void;
  error(title: string, detail?: string): void;
  problem(problem: Problem, title: string): void;
};
```

```ts
import { ApiError } from "@jwcarman/roux-web/api";
import { notify } from "@jwcarman/roux-web/feedback";

notify.success("Label saved");
notify.success("Order the venue is done", { label: "Undo", onClick: undo });
notify.error("The invitation could not be sent", "Ask them to sign in from the sign-in page.");

// Only where you catch the error yourself:
if (error instanceof ApiError) {
  notify.problem(error.problem, "Could not reopen Order the venue");
}
```

- `success`: a status toast. `action` adds a button to it, such as Undo.
- `error`: a failure toast, `title` and an optional `detail` under it. For a failure the app itself
  detects (a save that went through but whose email did not).
- `problem`: a refused request. `title` names what failed (`Could not reopen Order the venue`); under it go the
  problem's `detail` and, for a 500, `Reference: <errorId>` on its own line. This is the toast
  `useSchemaForm` and `useServerAction` show for a refusal ([Errors](errors.md#in-the-browser-what-the-user-sees)),
  so call it only where you handle an `ApiError` yourself.

Toasts appear at the bottom right (`bottom-end`; inset on small screens) and pause while the page is
idle. A failure toast is an alert (`role="alert"`, announced at once); any other is a status
(`role="status"`, announced when the reader is idle).

Write titles as the outcome in plain words, naming the thing: `Order the venue is done`, `Label saved`,
`Could not remove Urgent`. A save made through `useSchemaForm` or `useServerAction` toasts its
success in that hook's `onSuccess` and its failure through `failure`; do not toast either again.

`toaster` is the toaster `Toaster` draws: show toasts through `notify`, not `toaster.create`. Tests use
it to clear toasts between cases (`toaster.remove()`, see [Testing](testing.md#vitest-with-msw)).

## Ask before an action with consequences

```ts
function useConfirm(): (options: ConfirmOptions) => Promise<boolean>;

interface ConfirmOptions {
  title: string;
  message: string;
  confirmLabel: string; // the action, such as "Archive"
  destructive?: boolean; // colours the confirming button as a destructive action
}

function removal(title: string, message: string): ConfirmOptions; // confirmLabel "Remove", destructive
```

The mutation, in the resource module:

```ts
/** Archives an item; the item and the lists refresh. */
export const archiveItem = (id: string) =>
  mutationOptions({
    mutationFn: () => sendJson<void>("POST", path`items/${id}/archive`),
    meta: { refreshes: [queryKeys.items.detail(id), queryKeys.items.lists()] },
  });
```

and the button:

```tsx
import { Button } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, useConfirm } from "@jwcarman/roux-web/feedback";
import { archiveItem } from "./items";

/** Archive, after asking: the item leaves the lists but keeps its history. */
export function ArchiveItemButton({ item }: { item: { id: string; title: string } }) {
  const confirm = useConfirm();
  const { run, pending } = useServerAction(archiveItem(item.id), {
    failure: `Could not archive ${item.title}`,
    onSuccess: () => notify.success(`${item.title} was archived`),
  });

  async function onArchive() {
    const confirmed = await confirm({
      title: `Archive ${item.title}?`,
      message: "It leaves the lists. Its history is kept.",
      confirmLabel: "Archive",
      destructive: true,
    });
    if (confirmed) {
      await run();
    }
  }

  return (
    <Button variant="outline" loading={pending} onClick={onArchive}>
      Archive
    </Button>
  );
}
```

- `confirm(options)` opens the app's one dialog (`role="alertdialog"`) and resolves `true` when the
  confirming button is pressed, `false` on Cancel, Escape or closing. Cancel has the focus first, so
  Enter alone never confirms.
- `confirmLabel` is the action's verb, as on the button that asked (`Archive`, not `OK` or `Yes`).
- `ConfirmOptions` is the question. For removing something, use `removal(title, message)`, which is
  `{ title, message, confirmLabel: "Remove", destructive: true }` (the whole button is in
  [Queries and mutations](queries-and-mutations.md#run-a-mutation-from-a-button)):

  ```ts
  if (await confirm(removal(`Remove ${label.name}?`, "It will be removed from the list."))) {
    await run(label.id);
  }
  ```
- `useConfirm` throws `useConfirm outside ConfirmProvider` when no `ConfirmProvider` is above it,
  including in a test that renders a component without one.

## Show that part of a page failed

```ts
function ErrorMessage(props: ErrorMessageProps): JSX.Element;

interface ErrorMessageProps {
  title?: string;
  children: ReactNode;
}
```

`ErrorMessage` (`ErrorMessageProps`: `title?`, `children`) is an error alert (`role="alert"`, announced when it appears) for a section that could
not load or a step that could not finish, inside the page:

```tsx
import { Button, Heading, List, Spinner, Stack } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { ErrorMessage } from "@jwcarman/roux-web/feedback";
import { labelsQuery } from "../labels/labels";

/** The labels an item can carry, or why they cannot be shown. */
export function LabelChoices() {
  const labels = useQuery(labelsQuery);
  return (
    <Stack gap="3">
      <Heading as="h3" size="md">
        Label it
      </Heading>
      {labels.isPending && <Spinner aria-label="Loading" />}
      {labels.isError && (
        <ErrorMessage title="The labels could not be loaded">
          <Button size="xs" variant="outline" onClick={() => void labels.refetch()}>
            Try again
          </Button>
        </ErrorMessage>
      )}
      {labels.isSuccess && (
        <List.Root>
          {labels.data.map((label) => (
            <List.Item key={label.id}>{label.name}</List.Item>
          ))}
        </List.Root>
      )}
    </Stack>
  );
}
```

`QueryTable`, `SimpleQueryTable`, `InfiniteList` and `InfiniteSelect` already show one when their
data fails ([Tables and paging](tables-and-paging.md)).

## Pages for a missing record and a failed page

```ts
function NotFoundPage(props: { title?: string }): JSX.Element; // title defaults to "Page not found"
function ErrorPage(props: { onRetry: () => void }): JSX.Element;
```

- `NotFoundPage` says the address may be mistyped or what it pointed to is gone, with a link to `/`.
- `ErrorPage` says `Something went wrong`, `This page could not be shown. Trying again often works.`,
  and a `Try again` button that calls `onRetry` (`role="alert"`).

Give them to TanStack Router: the root route's `notFoundComponent` (an unknown address) and
`errorComponent` (a loader or a component that threw, a query that failed). `component` is the app's
layout:

```tsx
import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, Outlet, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ErrorPage, NotFoundPage } from "@jwcarman/roux-web/feedback";

/** What every route's `beforeLoad` and `loader` can use. */
export interface RouterContext {
  queryClient: QueryClient;
}

/** Retrying clears the failure and runs the routes' loaders again. */
function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <ErrorPage
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: () => <Outlet />,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: RouteError,
});
```

A detail route turns the server's 404 into its own not-found page, named for the record:

```tsx
import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { itemQuery } from "../../../items/items";
import { ItemPage } from "../../../items/ItemPage";

/** An item's page. The loader fetches the item first; one that does not exist is a 404. */
export const Route = createFileRoute("/_signedIn/items/$itemId")({
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(itemQuery(params.itemId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        notFound({ throw: true });
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="Item not found" />,
  component: ItemPage,
});
```

The loader's `ensureQueryData` rejects with an `ApiError`; a 404 becomes `notFound()`, and anything
else reaches the root's `ErrorPage`. The page then reads the record with `useSuspenseQuery`
([Queries and mutations](queries-and-mutations.md#read-data-in-a-page)).

## Don't

- Don't toast a field's mistake; it goes under the field.
- Don't toast a refusal that `useSchemaForm` or `useServerAction` already showed.
- Don't call `toaster.create` or Chakra's toaster; use `notify`.
- Don't build a confirmation dialog of your own, or use `window.confirm`; use `useConfirm`.
- Don't write a "not found" or "something went wrong" page; use `NotFoundPage` and `ErrorPage`.
