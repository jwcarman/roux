import {
  useMutation,
  useQueryClient,
  type QueryClient,
  type QueryKey,
  type UseMutationOptions,
} from "@tanstack/react-query";
import { ApiError, isSessionLost } from "./client";
import { hasRouxRefreshes } from "./queryClient";
import { notify } from "../feedback/notify";

/** What a server action adds to its mutation: the failure title, and what to do on success. */
export interface ServerActionOptions<TData, TVariables> {
  /** The toast title when the request is refused, such as `Could not archive Acme`. Defaults to `Could not save`. */
  failure?: string | ((variables: TVariables) => string);
  /** Runs once the request succeeds: a success toast, closing a dialog. The mutation's own `onSuccess` runs too. */
  onSuccess?: (data: TData, variables: TVariables) => void | Promise<void>;
}

/** What `useServerAction` returns: the action to run and whether it is out. */
export interface ServerAction<Variables> {
  /** Sends the request; true when it succeeded. A refusal has already been shown to the user. */
  run: (variables: Variables) => Promise<boolean>;
  /** Whether a request is out, for a button's loading state. */
  pending: boolean;
}

/**
 * Shows why a request was refused, titled by the failure: the server's reason (its Problem Detail)
 * under `title`. A lost session (401) shows nothing, because the session provider sends the user to
 * sign in; anything else (a network failure) shows `title` alone.
 */
export function refusalToast(error: unknown, title: string): void {
  if (isSessionLost(error)) {
    return;
  }
  if (error instanceof ApiError) {
    notify.problem(error.problem, title);
  } else {
    notify.error(title);
  }
}

/**
 * Throws when a mutation names `meta.refreshes` but `client` is not roux's, which would silently
 * refresh nothing.
 */
export function assertRefreshesHonoured(
  client: QueryClient,
  mutation: { meta?: { refreshes?: readonly QueryKey[] } },
): void {
  if (mutation.meta?.refreshes !== undefined && !hasRouxRefreshes(client)) {
    throw new Error("meta.refreshes needs roux's query client: use createQueryClient() from @jwcarman/roux-web/api");
  }
}

/**
 * Runs a TanStack Query mutation as one user action. A refusal tells the user the server's reason
 * (its Problem Detail) under `failure`; `run` answers whether it succeeded. The queries the
 * mutation names in `meta.refreshes` are refreshed by the query client, not by this hook.
 */
export function useServerAction<TData, TVariables = void>(
  mutation: UseMutationOptions<TData, Error, TVariables>,
  options: ServerActionOptions<TData, TVariables> = {},
): ServerAction<TVariables> {
  const queryClient = useQueryClient();
  const { mutateAsync, isPending } = useMutation({
    ...mutation,
    onSuccess: async (data, variables, onMutateResult, context) => {
      await mutation.onSuccess?.(data, variables, onMutateResult, context);
      await options.onSuccess?.(data, variables);
    },
    onError: async (error, variables, onMutateResult, context) => {
      await mutation.onError?.(error, variables, onMutateResult, context);
      const { failure = "Could not save" } = options;
      refusalToast(error, typeof failure === "function" ? failure(variables) : failure);
    },
  });
  return {
    run: async (variables) => {
      assertRefreshesHonoured(queryClient, mutation);
      return mutateAsync(variables).then(
        () => true,
        () => false,
      );
    },
    pending: isPending,
  };
}
