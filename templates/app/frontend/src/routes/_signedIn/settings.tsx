import { createFileRoute } from "@tanstack/react-router";
import { Settings } from "../../shell/Settings";

export const Route = createFileRoute("/_signedIn/settings")({
  component: Settings,
});
