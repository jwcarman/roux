import { createFileRoute } from "@tanstack/react-router";
import { LinkLanding } from "../../shell/LinkLanding";

export const Route = createFileRoute("/signin/link")({
  component: LinkLanding,
});
