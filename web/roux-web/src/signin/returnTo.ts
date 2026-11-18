import { useState } from "react";

/*
 * Where a signed-out visitor was going, kept so sign-in can send them there. The emailed link opens
 * in a new tab, so the place cannot live in the URL or in the tab's session storage: it is kept in
 * local storage until the next sign-in takes it.
 */

const KEY = "roux.returnTo";

/** Whether `path` is a page of the app that sign-in may send someone to: not Home, sign-in, the API or who. */
export function isReturnable(path: string): boolean {
  return (
    path.startsWith("/") &&
    !path.startsWith("//") &&
    !path.includes("\\") &&
    path !== "/" &&
    !/^\/(signin|api|who)(\/|\?|#|$)/.test(path)
  );
}

/** The stored place, or null when there is none or storage is blocked (a private window). */
function stored(): string | null {
  try {
    return localStorage.getItem(KEY);
  } catch {
    return null;
  }
}

/**
 * Remembers `path` (with its search) for the next sign-in, or forgets the last when it is not
 * returnable. Call it from the route guard that sends a signed-out visitor to sign in.
 */
export function rememberSignInReturn(path: string): void {
  try {
    if (isReturnable(path)) {
      localStorage.setItem(KEY, path);
    } else {
      localStorage.removeItem(KEY);
    }
  } catch {
    // Storage blocked (a private window): sign-in lands on Home instead.
  }
}

/** The place remembered, once: undefined when there is none, or storage is blocked. */
export function takeSignInReturn(): string | undefined {
  const path = stored();
  try {
    localStorage.removeItem(KEY);
  } catch {
    // Storage blocked: nothing was stored to forget.
  }
  return path !== null && isReturnable(path) ? path : undefined;
}

/**
 * What a sign-in does when it succeeds: opens the page the visitor asked for before signing in
 * (kept by {@link rememberSignInReturn}), or Home. It loads the page afresh (a full page load), so the
 * app starts as the person who just signed in, with their session and none of the last visitor's data.
 * Every roux sign-in component calls it; call it yourself after a sign-in of your own.
 */
export function useSignInReturn(): () => void {
  const [finish] = useState(() => () => location.replace(takeSignInReturn() ?? "/"));
  return finish;
}
