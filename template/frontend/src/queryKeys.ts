/**
 * The app's query keys, built in one place so related queries share a prefix: a mutation's
 * `meta.refreshes: [queryKeys.items.lists()]` refreshes every items list. Add a feature's keys
 * here as it is built (`items: { all: ["items"] as const, lists: () => [...] }`); roux's own, such
 * as `userKeys`, come from roux-web under `["roux", ...]`.
 * See https://tkdodo.eu/blog/effective-react-query-keys#use-query-key-factories
 */
export const queryKeys = {};
