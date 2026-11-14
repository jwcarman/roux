// @vitest-environment jsdom
import { MutationObserver, QueryClient, QueryObserver } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { ApiError } from "./client";
import { createQueryClient, hasRouxRefreshes, shouldRetry, useClearQueriesOnIdentityChange } from "./queryClient";
import { renderHookWithProviders, testQueryClient } from "../testing/render";

describe("shouldRetry", () => {
  it("does not retry what the server refused", () => {
    for (const status of [400, 401, 403, 404, 409]) {
      expect(shouldRetry(0, new ApiError(status))).toBe(false);
    }
  });

  it("retries a server error or a network failure twice", () => {
    expect(shouldRetry(0, new ApiError(500))).toBe(true);
    expect(shouldRetry(0, new ApiError(503))).toBe(true);
    expect(shouldRetry(1, new TypeError("Failed to fetch"))).toBe(true);
    expect(shouldRetry(2, new ApiError(500))).toBe(false);
  });
});

describe("useClearQueriesOnIdentityChange", () => {
  function seeded() {
    const client = testQueryClient();
    client.setQueryData(["members", "list", {}], { data: ["cached"] });
    return client;
  }

  function track(client = seeded()) {
    const view = renderHookWithProviders(
      ({ identityId }: { identityId: string | null | undefined }) => useClearQueriesOnIdentityChange(identityId),
      client,
      { identityId: undefined as string | null | undefined },
    );
    return { client, rerender: (identityId: string | null | undefined) => view.rerender({ identityId }) };
  }

  function cached(client: ReturnType<typeof testQueryClient>) {
    return client.getQueryData(["members", "list", {}]);
  }

  it("keeps the cache while the session loads and for the same identity", () => {
    const { client, rerender } = track();
    rerender("ada");
    rerender("ada");
    expect(cached(client)).toBeDefined();
  });

  it("keeps the cache when the session reloads for the same identity", () => {
    const { client, rerender } = track();
    rerender("ada");
    rerender(undefined);
    expect(cached(client)).toBeDefined();
    rerender("ada");
    expect(cached(client)).toBeDefined();
  });

  it("clears the cache when the session loads signed out", () => {
    const { client, rerender } = track();
    rerender(null);
    expect(cached(client)).toBeUndefined();
  });

  it("clears the cache on signing out", () => {
    const { client, rerender } = track();
    rerender("ada");
    rerender(null);
    expect(cached(client)).toBeUndefined();
  });

  it("clears the cache when another identity signs in", () => {
    const { client, rerender } = track();
    rerender("ada");
    client.setQueryData(["members", "list", {}], { data: ["ada's view"] });
    rerender("grace");
    expect(cached(client)).toBeUndefined();
  });
});

describe("createQueryClient", () => {
  /** A watched query whose fetches take a moment: `completed` counts the ones that have finished. */
  function watched(refetchFails = false) {
    const client = createQueryClient();
    let fetches = 0;
    let completed = 0;
    const observer = new QueryObserver(client, {
      queryKey: ["customers", "list"],
      retry: false,
      queryFn: async () => {
        const first = ++fetches === 1;
        await new Promise((resolve) => setTimeout(resolve, 20));
        if (refetchFails && !first) {
          throw new ApiError(404);
        }
        completed++;
        return completed;
      },
    });
    const unsubscribe = observer.subscribe(() => undefined);
    return { client, fetches: () => fetches, completed: () => completed, unsubscribe };
  }

  async function settled(count: () => number, expected: number) {
    while (count() < expected) {
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
  }

  it("refreshesTheNamedQueriesAfterSuccess", async () => {
    const { client, completed, unsubscribe } = watched();
    await settled(completed, 1);
    const mutation = new MutationObserver(client, {
      mutationFn: () => Promise.resolve("saved"),
      meta: { refreshes: [["customers"]] },
    });

    await expect(mutation.mutate()).resolves.toBe("saved");

    expect(completed()).toBe(2);
    unsubscribe();
  });

  it("refreshesAfterARefusalToo", async () => {
    const { client, completed, unsubscribe } = watched();
    await settled(completed, 1);
    const mutation = new MutationObserver(client, {
      mutationFn: () => Promise.reject(new ApiError(409)),
      meta: { refreshes: [["customers"]] },
    });

    await expect(mutation.mutate()).rejects.toBeInstanceOf(ApiError);

    expect(completed()).toBe(2);
    unsubscribe();
  });

  it("aRefetchThatFailsLeavesASuccessfulMutationSuccessful", async () => {
    const { client, fetches, unsubscribe } = watched(true);
    await settled(fetches, 1);
    await new Promise((resolve) => setTimeout(resolve, 30));
    const mutation = new MutationObserver(client, {
      mutationFn: () => Promise.resolve("saved"),
      meta: { refreshes: [["customers"]] },
    });

    await expect(mutation.mutate()).resolves.toBe("saved");

    expect(fetches()).toBe(2);
    unsubscribe();
  });

  it("aMutationWithoutMetaRefreshesNothing", async () => {
    const { client, fetches, completed, unsubscribe } = watched();
    await settled(completed, 1);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const mutation = new MutationObserver(client, { mutationFn: () => Promise.resolve("saved") });

    await mutation.mutate();

    expect(fetches()).toBe(1);
    expect(invalidate).not.toHaveBeenCalled();
    unsubscribe();
  });

  it("refreshesOnlyTheNamedQueries", async () => {
    const { client, completed, unsubscribe } = watched();
    await settled(completed, 1);
    client.setQueryData(["orders"], ["cached"]);
    const mutation = new MutationObserver(client, {
      mutationFn: () => Promise.resolve("saved"),
      meta: { refreshes: [["customers"]] },
    });

    await mutation.mutate();

    expect(client.getQueryState(["orders"])?.isInvalidated).toBe(false);
    expect(client.getQueryState(["customers", "list"])?.isInvalidated).toBe(false);
    expect(completed()).toBe(2);
    unsubscribe();
  });

  it("retries queries with shouldRetry", () => {
    expect(createQueryClient().getDefaultOptions().queries?.retry).toBe(shouldRetry);
  });
});

describe("hasRouxRefreshes", () => {
  it("is true only for a client made by createQueryClient", () => {
    expect(hasRouxRefreshes(createQueryClient())).toBe(true);
    expect(hasRouxRefreshes(new QueryClient())).toBe(false);
  });
});
