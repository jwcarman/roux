import { redirect } from "@tanstack/react-router";
import type { Me } from "../api";
import { rememberSignInReturn } from "@jwcarman/roux-web/signin";

/**
 * Route guards, for `beforeLoad`. Each throws a redirect when the caller may not see the route;
 * the server enforces the same rules on every API call, so these only spare the user a page they
 * cannot use.
 */

/**
 * The signed-in caller; a signed-out visitor goes to sign in, and signing in sends them on to
 * `returnTo` (the page they asked for, with its search) when it is given.
 */
export function requireSignedIn(me: Me | null | undefined, returnTo?: string): Me {
  if (!me) {
    if (returnTo !== undefined) {
      rememberSignInReturn(returnTo);
    }
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
 * A caller without `permission` goes to Home itself (`home: true` stops `/` sending them on to the
 * start place, which could be this very page); a signed-out visitor goes to sign in.
 */
export function requirePermission(me: Me | null | undefined, permission: string): void {
  if (!requireSignedIn(me).permissions.includes(permission)) {
    throw redirect({ to: "/", search: { home: true } });
  }
}
