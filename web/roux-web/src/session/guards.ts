import { redirect, type AnyRouter } from "@tanstack/react-router";

/**
 * Route guards, for `beforeLoad`. Each throws a redirect when the caller may not see the route; the
 * server enforces the same rules on every API call, so these only spare the person a page they
 * cannot use. They name no app's routes, so each redirect is typed for any router (`AnyRouter`):
 * `/signin` and `/` are what every roux app has.
 */

declare module "@tanstack/history" {
  interface HistoryState {
    /** Set by a guard that sends the caller to Home: show Home itself, not the start place. */
    home?: true;
  }
}

/** The signed-in caller (`useSession().currentMe()`); a signed-out visitor goes to sign in. */
export function requireSignedIn<M>(me: M | null | undefined): M {
  if (me) {
    return me;
  }
  // `throw: true` makes redirect throw TanStack's redirect itself; its declared type does not say so.
  return redirect<AnyRouter>({ to: "/signin", throw: true }) as never;
}

/** For the sign-in page: a signed-in caller goes home. */
export function requireSignedOut(me: unknown): void {
  if (me) {
    redirect<AnyRouter>({ to: "/", throw: true });
  }
}

/**
 * A caller without `permission` goes to Home itself (`home` in the history state stops `/` sending
 * them on to the start place, which could be this very page). For a route under the signed-in
 * layout, whose guard has already sent a signed-out visitor to sign in:
 * `requirePermission(context.me, USERS_READ)`.
 */
export function requirePermission(me: { permissions: readonly string[] }, permission: string): void {
  if (!me.permissions.includes(permission)) {
    redirect<AnyRouter>({ to: "/", state: { home: true }, throw: true });
  }
}
