import { createFileRoute } from "@tanstack/react-router";
import { THEME_MANAGE } from "../../api";
import { requirePermission } from "../../shell/guards";
import { Appearance } from "../../shell/Appearance";

export const Route = createFileRoute("/_signedIn/appearance")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), THEME_MANAGE),
  component: Appearance,
});
