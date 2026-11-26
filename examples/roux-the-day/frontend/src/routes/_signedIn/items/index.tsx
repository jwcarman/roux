import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import { Surface } from "@jwcarman/roux-web/surface";
import { ITEMS_READ } from "../../../permissions.gen";
import { itemsBinding } from "../../../items/items.binding";
import itemsSurface from "../../../items/items.surface.json";

export const Route = createFileRoute("/_signedIn/items/")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  component: () => <Surface surface={itemsSurface} binding={itemsBinding} />,
});
