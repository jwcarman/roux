import { useMutationState, type MutationKey, type QueryKey, type UseMutationOptions } from "@tanstack/react-query";
import { useRef } from "react";
import { useServerAction, type ServerActionOptions } from "./serverAction";

/** What marks options as made by {@link optimisticMutation}, for the type and at run time. */
const MADE_BY_OPTIMISTIC_MUTATION = Symbol("optimisticMutation");

/**
 * Mutation options made by {@link optimisticMutation}: the only kind {@link useOptimisticValue} and
 * {@link useOptimisticToggle} take, so a mutation without a key, a scope or a refresh does not compile.
 */
export type OptimisticMutation<TData, TVariables> = UseMutationOptions<TData, Error, TVariables> & {
  readonly [MADE_BY_OPTIMISTIC_MUTATION]: true;
};

/** What {@link optimisticMutation} takes: a mutation's options, but for the key and scope it sets, and with `meta.refreshes` required. */
export type OptimisticMutationOptions<TData, TVariables> = Omit<
  UseMutationOptions<TData, Error, TVariables>,
  "mutationKey" | "scope" | "meta"
> & {
  /** The queries that hold the value the control shows (at least one): refetched once each save settles, so the control shows what the server holds. */
  meta: { refreshes: readonly [QueryKey, ...QueryKey[]] };
};

/**
 * The mutation of a control that saves on change (a toggle, a switch, a rating, a row's dropdown).
 * `key` names the control, one per thing it changes (`queryKeys.attendance.mark(classId, date, studentId)`):
 * it becomes the mutation's `mutationKey`, so the hook can find the control's pending value, and its
 * `scope`, so the control's saves reach the server one at a time, in the order they were made. The
 * mutation sends the wanted value (`present: true`), never "flip it".
 */
export function optimisticMutation<TData, TVariables>(
  key: MutationKey,
  options: OptimisticMutationOptions<TData, TVariables>,
): OptimisticMutation<TData, TVariables> {
  return { ...options, mutationKey: key, scope: { id: JSON.stringify(key) }, [MADE_BY_OPTIMISTIC_MUTATION]: true };
}

/** What the optimistic hooks take besides the mutation: the toast title when a save is refused. */
export type OptimisticOptions<TData, TVariables> = Pick<ServerActionOptions<TData, TVariables>, "failure">;

interface Optimistic<TVariables> {
  shown: TVariables;
  set: (value: TVariables) => Promise<boolean>;
  /** What the control will show once what was asked has been shown: the last value asked, else `shown`. */
  current: () => TVariables;
}

function useOptimistic<TData, TVariables>(
  mutation: OptimisticMutation<TData, TVariables>,
  serverValue: NoInfer<TVariables>,
  options: OptimisticOptions<TData, TVariables>,
): Optimistic<TVariables> {
  if (mutation[MADE_BY_OPTIMISTIC_MUTATION] !== true) {
    throw new Error("The optimistic hooks take the options optimisticMutation(key, options) makes");
  }
  const { run } = useServerAction(mutation, options);
  const pending = useMutationState({
    filters: { mutationKey: mutation.mutationKey, exact: true, status: "pending" },
    select: (found) => found.state.variables as TVariables,
  });
  /**
   * The last value asked while any save is waiting for its answer, and how many are. A second
   * change in the same instant (a double tap) is handled before React shows the first, so it cannot
   * read `shown`.
   */
  const lastAsked = useRef<{ value: TVariables } | null>(null);
  const waiting = useRef(0);
  const shown = pending.length > 0 ? pending[pending.length - 1] : serverValue;

  async function set(value: TVariables): Promise<boolean> {
    lastAsked.current = { value };
    waiting.current += 1;
    try {
      return await run(value);
    } finally {
      waiting.current -= 1;
      if (waiting.current === 0) {
        lastAsked.current = null;
      }
    }
  }

  return { shown, set, current: () => (lastAsked.current === null ? shown : lastAsked.current.value) };
}

/**
 * A value that saves when it changes and shows the change at once: `[shown, set]`. `shown` is the
 * value of the control's latest save that is still waiting for the server, else `serverValue` (what
 * the query holds). `set(value)` runs the mutation; a refusal toasts the server's reason (as
 * {@link useServerAction} does) and, once nothing is waiting, `shown` is the server's value again.
 * It answers whether the save succeeded.
 */
export function useOptimisticValue<TData, TVariables>(
  mutation: OptimisticMutation<TData, TVariables>,
  serverValue: NoInfer<TVariables>,
  options: OptimisticOptions<TData, TVariables> = {},
): [shown: TVariables, set: (value: TVariables) => Promise<boolean>] {
  const { shown, set } = useOptimistic(mutation, serverValue, options);
  return [shown, set];
}

/**
 * {@link useOptimisticValue} for a boolean: `[shown, toggle]`. `toggle()` asks for the opposite of what
 * was last asked, so two quick taps ask for `true` then `false` even before the first is shown.
 */
export function useOptimisticToggle<TData>(
  mutation: OptimisticMutation<TData, boolean>,
  serverValue: boolean,
  options: OptimisticOptions<TData, boolean> = {},
): [shown: boolean, toggle: () => Promise<boolean>] {
  const { shown, set, current } = useOptimistic(mutation, serverValue, options);
  return [shown, () => set(!current())];
}
