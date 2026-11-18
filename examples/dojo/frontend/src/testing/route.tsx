import { QueryClientProvider } from "@tanstack/react-query";
import { createBrowserHistory, createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ColorModeProvider } from "../shell/colorMode";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { routeTree } from "../routeTree.gen";
import { SessionProvider, useSession } from "../shell/session";
import { ThemeProvider } from "@jwcarman/roux-web/theme";
import { testQueryClient } from "./render";
import { server } from "./server";

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
  server.use(
    http.get("/who/me", () =>
      permissions === null
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({ identityId: "id-1", permissions }),
    ),
  );
  const client = testQueryClient();
  if (browserHistory) {
    window.history.replaceState({}, "", path);
  }
  const router = createRouter({
    routeTree,
    history: browserHistory ? createBrowserHistory() : createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: client, session: undefined! },
  });

  function Routes() {
    const session = useSession();
    return session.me === undefined ? null : <RouterProvider router={router} context={{ session }} />;
  }

  render(
    <QueryClientProvider client={client}>
      <ThemeProvider>
        <ColorModeProvider>
          <ConfirmProvider>
            <SessionProvider>
              <Routes />
              <Toaster />
            </SessionProvider>
          </ConfirmProvider>
        </ColorModeProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}
