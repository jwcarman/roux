import { createFileRoute } from "@tanstack/react-router";
import { requireSignedIn } from "../shell/guards";

/** The routes under `_signedIn/` need a signed-in caller; a signed-out visitor goes to sign in
 * and, once signed in, back to the page they asked for. */
export const Route = createFileRoute("/_signedIn")({
  beforeLoad: ({ context, location }) => {
    requireSignedIn(context.session.currentMe(), location.href);
  },
});
