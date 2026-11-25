import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { requirePermission } from "@jwcarman/roux-web/session";
import { ITEMS_READ } from "../../../permissions.gen";
import { itemQuery } from "../../../items/items";
import { Item } from "../../../items/ItemPage";

/** An item's page. The loader fetches the item first; an item that does not exist is a 404. */
export const Route = createFileRoute("/_signedIn/items/$itemId")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(itemQuery(params.itemId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="Item not found" />,
  component: Item,
});
