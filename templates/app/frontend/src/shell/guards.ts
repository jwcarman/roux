import { redirect } from "@tanstack/react-router";
import type { Me } from "../api";

/**
 * Route guards, for `beforeLoad`. Each throws a redirect when the caller may not see the route;
 * the server enforces the same rules on every API call, so these only spare the user a page they
 * cannot use.
 */

declare module "@tanstack/history" {
  interface HistoryState {
    /** Set by a guard that sends the caller to Home: show Home itself, not the start place. */
    home?: true;
  }
}

/** The signed-in caller; a signed-out visitor goes to sign in. */
export function requireSignedIn(me: Me | null | undefined): Me {
  if (!me) {
    throw redirect({ to: "/signin" });
  }
  return me;
}

/** For the sign-in page: a signed-in caller goes home. */
export function requireSignedOut(me: Me | null | undefined): void {
  if (me) {
    throw redirect({ to: "/" });
  }
}

/**
 * A caller without `permission` goes to Home itself (`home` in the history state stops `/` sending them on to the
 * start place, which could be this very page). For a route under `_signedIn`, whose guard has
 * already sent a signed-out visitor to sign in: `requirePermission(context.me, ...)`.
 */
export function requirePermission(me: Me, permission: string): void {
  if (!me.permissions.includes(permission)) {
    throw redirect({ to: "/", state: { home: true } });
  }
}
