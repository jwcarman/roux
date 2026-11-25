/**
 * The app's query keys, built in one place so related queries share a prefix: a mutation's
 * `meta.refreshes: [queryKeys.users.lists()]` refreshes every users list.
 * See https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
export const queryKeys = {
  users: {
    all: ["users"] as const,
    lists: () => [...queryKeys.users.all, "list"] as const,
    list: (filters: { search?: string; role?: string; status?: string }) =>
      [...queryKeys.users.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.users.all, "detail", id] as const,
    activities: (id: string) =>
      [...queryKeys.users.all, "activities", id] as const,
  },
  items: {
    all: ["items"] as const,
    lists: () => [...queryKeys.items.all, "list"] as const,
    list: (filters: {
      search?: string;
      when?: string;
      assignee?: string;
      status?: string;
    }) => [...queryKeys.items.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.items.all, "detail", id] as const,
  },
  team: {
    active: () => ["team", "active"] as const,
  },
  roles: {
    all: ["roles"] as const,
    invitable: () => [...queryKeys.roles.all, "invitable"] as const,
  },
};
