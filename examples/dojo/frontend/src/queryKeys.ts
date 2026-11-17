/**
 * The app's query keys, built in one place so related queries share a prefix and one
 * `invalidateQueries({ queryKey: queryKeys.members.lists() })` refreshes them all.
 * See https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
export const queryKeys = {
  members: {
    all: ["members"] as const,
    lists: () => [...queryKeys.members.all, "list"] as const,
    list: (filters: { search?: string; role?: string; status?: string }) =>
      [...queryKeys.members.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.members.all, "detail", id] as const,
    activities: (id: string) => [...queryKeys.members.all, "activities", id] as const,
  },
  theme: ["theme"] as const,
};
