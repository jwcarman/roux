import { createBrowserHistory, createMemoryHistory } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { App, createAppRouter } from "../App";
import { server, signedInAs, testQueryClient } from "@jwcarman/roux-web/testing";

/**
 * Opens `path` in the whole app, as TanStack's file-based routing guide tests routes: a router
 * built from the generated route tree, in memory, signed in with `permissions` (or signed out with
 * `null`). Returns the router, so a test can check where it ended up. `browserHistory` uses the
 * window's own address bar instead of memory, for what only the browser's history does (a page that
 * rewrites the address itself, as the sign-in link's does).
 */
export function renderRoute(
  path: string,
  { permissions, browserHistory = false }: { permissions: string[] | null; browserHistory?: boolean },
) {
  server.use(...signedInAs(permissions));
  const client = testQueryClient();
  if (browserHistory) {
    window.history.replaceState({}, "", path);
  }
  const router = createAppRouter(
    client,
    browserHistory ? createBrowserHistory() : createMemoryHistory({ initialEntries: [path] }),
  );
  render(<App queryClient={client} router={router} />);
  return { router, client };
}
