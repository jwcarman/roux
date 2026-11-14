import { MutationCache, QueryClient, useQueryClient, type QueryKey } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { ApiError } from "./client";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { refreshes?: readonly QueryKey[] };
  }
}

const rouxClients = new WeakSet<QueryClient>();

/**
 * Retries a failed query twice, unless the server refused it (a 4xx): asking again gets the same
 * answer, and a 401 already sends the user to sign in.
 */
export function shouldRetry(failureCount: number, error: unknown): boolean {
  if (error instanceof ApiError && error.status < 500) {
    return false;
  }
  return failureCount < 2;
}

/**
 * The app's query client. Queries retry with {@link shouldRetry}. A mutation that names
 * `meta: { refreshes: [queryKey, ...] }` has those queries invalidated once it settles, whether it
 * succeeded or failed, and its promise resolves only after they have refetched.
 */
export function createQueryClient(): QueryClient {
  const client: QueryClient = new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry } },
    mutationCache: new MutationCache({
      onSettled: async (_data, _error, _variables, _context, mutation) => {
        await Promise.all((mutation.meta?.refreshes ?? []).map((queryKey) => client.invalidateQueries({ queryKey })));
      },
    }),
  });
  rouxClients.add(client);
  return client;
}

/** True when `client` came from {@link createQueryClient}, so `meta.refreshes` is honoured. */
export function hasRouxRefreshes(client: QueryClient): boolean {
  return rouxClients.has(client);
}

/**
 * Empties the query cache when the signed-in identity goes away or changes, so no one sees rows
 * cached for whoever used the browser before. `undefined` (still loading) changes nothing.
 */
export function useClearQueriesOnIdentityChange(identityId: string | null | undefined): void {
  const client = useQueryClient();
  const previous = useRef<string | null | undefined>(undefined);
  useEffect(() => {
    if (identityId === undefined) {
      return;
    }
    if (identityId === null || (previous.current !== undefined && previous.current !== identityId)) {
      client.clear();
    }
    previous.current = identityId;
  }, [client, identityId]);
}
