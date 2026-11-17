import { createFileRoute } from "@tanstack/react-router";
import { requireSignedOut } from "../../shell/guards";
import { SignIn } from "../../shell/SignIn";

export const Route = createFileRoute("/signin/")({
  beforeLoad: ({ context }) => requireSignedOut(context.session.currentMe()),
  component: SignIn,
});
