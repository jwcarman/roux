import { createFileRoute } from "@tanstack/react-router";
import { RANKS_READ } from "../../permissions.gen";
import { requirePermission } from "../../shell/guards";
import { RanksPage } from "../../ranks/RanksPage";

export const Route = createFileRoute("/_signedIn/ranks")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), RANKS_READ),
  component: RanksPage,
});
