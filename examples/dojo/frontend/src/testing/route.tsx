import { QueryClientProvider } from "@tanstack/react-query";
import { createMemoryHistory, createRouter, RouterProvider } from "@tanstack/react-router";
import { render } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { ColorModeProvider } from "../shell/colorMode";
import { ConfirmProvider } from "@jwcarman/roux-web/feedback";
import { routeTree } from "../routeTree.gen";
import { SessionProvider, useSession } from "../shell/session";
import { DEFAULT_THEME } from "../shell/theme";
import { ThemeProvider } from "../shell/themeContext";
import { testQueryClient } from "./render";
import { server } from "./server";

/**
 * Opens `path` in the whole app, as TanStack's file-based routing guide tests routes: a router
 * built from the generated route tree, in memory, signed in with `permissions` (or signed out with
 * `null`). Returns the router, so a test can check where it ended up.
 */
export function renderRoute(path: string, { permissions }: { permissions: string[] | null }) {
  server.use(
    http.get("/who/me", () =>
      permissions === null
        ? new HttpResponse(null, { status: 401 })
        : HttpResponse.json({ identityId: "id-1", permissions }),
    ),
  );
  const client = testQueryClient();
  const router = createRouter({
    routeTree,
    history: createMemoryHistory({ initialEntries: [path] }),
    context: { queryClient: client, session: undefined! },
  });

  function Routes() {
    const session = useSession();
    return session.me === undefined ? null : <RouterProvider router={router} context={{ session }} />;
  }

  render(
    <QueryClientProvider client={client}>
      <ThemeProvider initial={DEFAULT_THEME}>
        <ColorModeProvider>
          <ConfirmProvider>
            <SessionProvider>
              <Routes />
            </SessionProvider>
          </ConfirmProvider>
        </ColorModeProvider>
      </ThemeProvider>
    </QueryClientProvider>,
  );
  return { router, client };
}
