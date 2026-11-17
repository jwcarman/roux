import { createFileRoute } from "@tanstack/react-router";
import { requireSignedIn } from "../shell/guards";

/** The routes under `_signedIn/` need a signed-in caller; a signed-out visitor goes to sign in. */
export const Route = createFileRoute("/_signedIn")({
  beforeLoad: ({ context }) => {
    requireSignedIn(context.session.currentMe());
  },
});
