/**
 * Where a signed-out visitor was going, kept so sign-in can send them there. The emailed link opens
 * in a new tab, so the place cannot live in the URL or in the tab's session storage: it is kept in
 * local storage until the next sign-in takes it.
 */

const KEY = "dojo.returnTo";

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

/** Remembers `path` (with its search) for the next sign-in, or forgets the last when it is not returnable. */
export function rememberReturn(path: string): void {
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
export function takeReturn(): string | undefined {
  try {
    const path = localStorage.getItem(KEY);
    localStorage.removeItem(KEY);
    return path !== null && isReturnable(path) ? path : undefined;
  } catch {
    return undefined;
  }
}
