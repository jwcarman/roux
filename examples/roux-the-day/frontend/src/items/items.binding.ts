// The items surface (items.surface.json) bound to the items queries and the addItem command.
import { bind } from "../surfaces";
import type { ItemsSurfaceData, ItemsSurfaceEvents } from "./items.surface.gen";

/** The list's filters, page and sort: every day, any status, anyone's, by day. */
const FIRST_ARGS = {
  search: "",
  when: "all",
  status: "",
  assignee: "anyone",
  pageIndex: 0,
  sortBy: "DAY",
  sortDirection: "ASC",
};

/** The counts and the list from the server; the filters and the add form kept on screen. A blank day is today. */
export const itemsBinding = bind<ItemsSurfaceData, ItemsSurfaceEvents>(({ d, query, local, command }) => ({
  data: {
    items: query("items", {
      search: d.itemsArgs.search,
      when: d.itemsArgs.when,
      status: d.itemsArgs.status,
      assignee: d.itemsArgs.assignee,
      pageIndex: d.itemsArgs.pageIndex,
      sortBy: d.itemsArgs.sortBy,
      sortDirection: d.itemsArgs.sortDirection,
    }),
    counts: query("itemCounts"),
    itemsArgs: local(FIRST_ARGS),
    draft: local({ title: "", day: "" }),
    errors: local({ title: "", day: "" }),
  },
  events: {
    addItem: command("addItem", (item) => item, {
      errors: d.errors,
      onSuccess: [{ reset: d.draft }, { toast: "Item added" }],
    }),
  },
}));
