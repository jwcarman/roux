import { createFileRoute } from "@tanstack/react-router";
import { PLANS_MANAGE } from "../../permissions.gen";
import { requirePermission } from "../../shell/guards";
import { PlansPage } from "../../plans/PlansPage";

export const Route = createFileRoute("/_signedIn/plans")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), PLANS_MANAGE),
  component: PlansPage,
});
