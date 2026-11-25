/**
 * The app's query keys, built in one place so related queries share a prefix: a mutation's
 * `meta.refreshes: [queryKeys.items.lists()]` refreshes every items list. roux's own, such as
 * `userKeys`, come from roux-web under `["roux", ...]`.
 * See https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
export const queryKeys = {
  items: {
    all: ["items"] as const,
    lists: () => [...queryKeys.items.all, "list"] as const,
    list: (filters: {
      search?: string;
      when?: string;
      assignee?: string;
      status?: string;
      from?: string;
      to?: string;
    }) => [...queryKeys.items.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.items.all, "detail", id] as const,
  },
  team: {
    active: () => ["team", "active"] as const,
  },
};
