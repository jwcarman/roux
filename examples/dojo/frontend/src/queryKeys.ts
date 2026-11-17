/**
 * The app's query keys, built in one place so related queries share a prefix: a mutation's
 * `meta.refreshes: [queryKeys.members.lists()]` refreshes every members list.
 * See https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
export const queryKeys = {
  classes: {
    all: ["classes"] as const,
    lists: () => [...queryKeys.classes.all, "list"] as const,
    detail: (id: string) => [...queryKeys.classes.all, "detail", id] as const,
    instructors: () => [...queryKeys.classes.all, "instructors"] as const,
  },
  members: {
    all: ["members"] as const,
    lists: () => [...queryKeys.members.all, "list"] as const,
    list: (filters: { search?: string; role?: string; status?: string }) =>
      [...queryKeys.members.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.members.all, "detail", id] as const,
    activities: (id: string) => [...queryKeys.members.all, "activities", id] as const,
  },
  ranks: {
    all: ["ranks"] as const,
    lists: () => [...queryKeys.ranks.all, "list"] as const,
  },
  students: {
    all: ["students"] as const,
    lists: () => [...queryKeys.students.all, "list"] as const,
    list: (filters: { search?: string; status?: string; rankId?: string }) =>
      [...queryKeys.students.lists(), filters] as const,
    detail: (id: string) => [...queryKeys.students.all, "detail", id] as const,
  },
  theme: ["theme"] as const,
};
