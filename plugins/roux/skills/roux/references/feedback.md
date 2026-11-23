# Feedback and buttons that act

Toasts (`notify`), confirmations (`useConfirm`), buttons that run a mutation (`useServerAction`),
controls that save on change (`optimisticMutation`), inline errors and error pages. A field's
mistake is not feedback: it stays under the field.

## Rules

- Toast only through `notify`; never `toaster.create`, Chakra's toaster or `window.confirm`.
- Don't toast what `useSchemaForm` or `useServerAction` already showed (success via `onSuccess`,
  refusal via `failure`).
- A button that changes data uses `useServerAction`; one with consequences asks first with
  `useConfirm`.
- Titles are the outcome in plain words naming the thing: `Ada was promoted`, `Could not remove
  Yellow belt`. A confirm's `confirmLabel` is the verb (`Deactivate`), not `OK`.
- Use `NotFoundPage` and `ErrorPage`; never write those pages.

## Names

`@jwcarman/roux-web/feedback`:

- `notify.success(title, action?)`, `notify.error(title, detail?)`, `notify.problem(problem, title)`
  (only where you catch an `ApiError` yourself).
- `useConfirm()` → `confirm(options: ConfirmOptions)` → `Promise<boolean>`; `ConfirmOptions` is
  `{ title, message, confirmLabel, destructive? }`; `removal(title, message)` gives
  `confirmLabel: "Remove"`, destructive.
- `ErrorMessage` (`ErrorMessageProps`: `title?`, `children`): an inline alert for a section that
  failed. Tables and lists already show their own.
- `NotFoundPage` (`title?`), `ErrorPage` (`onRetry`).
- `Toaster` and `ConfirmProvider`: mounted once in `main.tsx` (and in tests that need them);
  `toaster` is only for tests (`toaster.remove()`).

`@jwcarman/roux-web/api`:

- `useServerAction(mutation, { failure?, onSuccess? })` (`ServerActionOptions`) → `ServerAction`
  `{ run(variables): Promise<boolean>, pending }`. A refusal is toasted and `run` resolves `false`.
  `failure` may be a function of the variables.
- `optimisticMutation(key, { mutationFn, meta: { refreshes } })` (`OptimisticMutation`,
  `OptimisticMutationOptions`) with `useOptimisticToggle(mutation, serverValue, { failure })` →
  `[shown, toggle]` or `useOptimisticValue(...)` → `[shown, set]` (`OptimisticOptions`).

## Example: remove after asking

```tsx
import { Button } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { removeRank, type Rank } from "./ranks";

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

## A control that saves on change

A toggle, switch, rating or row dropdown: show the change at once, end on the server's value.

```ts
export const markAttendance = (classId: string, date: string, studentId: string) =>
  optimisticMutation(queryKeys.attendance.mark(classId, date, studentId), {
    mutationFn: (present: boolean) => attendanceApi.mark(classId, { studentId, date, present }),
    meta: { refreshes: [queryKeys.attendance.checkIn(classId, date)] },
  });

const [present, toggle] = useOptimisticToggle(markAttendance(classId, date, id), attendee.present, {
  failure: `Could not mark ${attendee.firstName}`,
});
```

- Send the wanted value (`present: boolean`), never "flip it".
- The key is as specific as the thing changed, or two controls share a queue.
- Not for forms with Save, creates, values the server computes, or typing.
- Never build it from `onMutate` + `setQueryData`: it flickers.

## Error pages

Root route: `notFoundComponent: () => <NotFoundPage />`, `errorComponent` rendering
`<ErrorPage onRetry={() => { reset(); void router.invalidate(); }} />`. A detail route's loader:

```tsx
loader: async ({ context, params }) => {
  try {
    await context.queryClient.ensureQueryData(studentQuery(params.studentId));
  } catch (error) {
    if (error instanceof ApiError && error.status === 404) throw notFound();
    throw error;
  }
},
notFoundComponent: () => <NotFoundPage title="Student not found" />,
```

The page then reads it with `useSuspenseQuery(studentQuery(studentId))`.

## Check

Vitest: render inside `ConfirmProvider` with `<Toaster />`; confirm with the dialog's verb button;
success is `role="status"`; a failure is found by its title text, then `closest("[role=alert]")`.
Clear toasts after each test: `act(() => toaster.remove())`.

## Pitfalls

- `useConfirm outside ConfirmProvider` in a test that renders without one.
- A button's refusal with field `errors` shows only the generic detail: refuse buttons with
  `InvariantViolationException`/`ConflictException` on the server.
- `useServerAction`'s `failure` can't tell a 409 apart; the server's `detail` under it does.
