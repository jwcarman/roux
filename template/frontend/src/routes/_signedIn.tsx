import { createFileRoute } from "@tanstack/react-router";
import type { Me } from "@jwcarman/roux-web/session";
import { rememberSignInReturn } from "@jwcarman/roux-web/signin";
import { requireSignedIn } from "@jwcarman/roux-web/session";

/**
 * The routes under `_signedIn/` need a signed-in caller; a signed-out visitor goes to sign in and,
 * once signed in, back to the page they asked for. Their pages read the caller with `useMe()`.
 */
export const Route = createFileRoute("/_signedIn")({
  beforeLoad: ({ context, location, cause }) => {
    const me = context.session.currentMe();
    // Only a page being opened is remembered: when the session ends on a page (signing out, or it
    // expired), signing in again starts at Home.
    if (!me && cause !== "stay") {
      rememberSignInReturn(location.href);
    }
    return { me: requireSignedIn(me) };
  },
});

/** The signed-in caller, for a page under `_signedIn` (its guard has made sure there is one). */
export function useMe(): Me {
  return Route.useRouteContext().me;
}
