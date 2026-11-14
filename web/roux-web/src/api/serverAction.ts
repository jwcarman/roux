import { useMutation, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { ApiError } from "./client";
import { notify } from "./notify";
import { problemOf } from "../problem";

export interface ServerActionOptions<Variables> {
  /** Sends the request, such as `(skill) => send("POST", `/api/skills/${skill.id}/archive`)`. */
  request: (variables: Variables) => Promise<Response>;
  /** What the user reads when the server gives no reason, such as `Could not archive Oi-zuki`. */
  failure: (variables: Variables) => string;
  /** The queries to refresh once the request is answered, refused or not: a refusal often means the page is out of date. */
  refreshes?: (variables: Variables) => QueryKey[];
  /** Runs once the request succeeds, before the refresh: a success toast, closing a dialog. */
  onSuccess?: (response: Response, variables: Variables) => void | Promise<void>;
}

export interface ServerAction<Variables> {
  /** Sends the request; true when it succeeded. A refusal has already been shown to the user. */
  run: (variables: Variables) => Promise<boolean>;
  /** Whether a request is out, for a button's loading state. */
  pending: boolean;
}

/**
 * One request that changes something, as a TanStack Query mutation. A refusal tells the user the
 * server's reason (its Problem Detail), or `failure` when it gave none; either way the queries
 * named by `refreshes` are refreshed. For a form's submission, use `showProblem` instead.
 */
export function useServerAction<Variables = void>(
  options: ServerActionOptions<Variables>,
): ServerAction<Variables> {
  const queryClient = useQueryClient();
  const mutation = useMutation({
    mutationFn: async (variables: Variables) => {
      const response = await options.request(variables);
      if (!response.ok) {
        throw new ApiError(response.status, await problemOf(response));
      }
      return response;
    },
    onSuccess: (response, variables) => options.onSuccess?.(response, variables),
    onError: (error, variables) => {
      const fallback = options.failure(variables);
      if (error instanceof ApiError) {
        notify.problem(error.problem, fallback);
      } else {
        notify.error(fallback);
      }
    },
    onSettled: async (_data, _error, variables) => {
      const keys = options.refreshes?.(variables) ?? [];
      await Promise.all(keys.map((queryKey) => queryClient.invalidateQueries({ queryKey })));
    },
  });
  return {
    run: (variables) => mutation.mutateAsync(variables).then(
      () => true,
      () => false,
    ),
    pending: mutation.isPending,
  };
}
