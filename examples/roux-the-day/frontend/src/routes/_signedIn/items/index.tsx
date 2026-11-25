import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import {
  enumSearchOf,
  idSearchOf,
  tableSearchOf,
} from "@jwcarman/roux-web/paging";
import { ITEMS_READ } from "../../../permissions.gen";
import { ITEM_SORTS, ITEM_STATUSES, ITEM_WHENS } from "../../../items/items";
import {
  Items,
  ITEMS_SEARCH_DEFAULTS,
  type ItemsSearch,
} from "../../../items/ItemsPage";

export const Route = createFileRoute("/_signedIn/items/")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  validateSearch: (raw: Record<string, unknown>): ItemsSearch => ({
    ...tableSearchOf(raw, ITEM_SORTS),
    when: enumSearchOf(raw.when, ITEM_WHENS),
    status: enumSearchOf(raw.status, ITEM_STATUSES),
    assignee: raw.assignee === "me" ? "me" : idSearchOf(raw.assignee),
  }),
  search: { middlewares: [stripSearchParams(ITEMS_SEARCH_DEFAULTS)] },
  component: Items,
});
