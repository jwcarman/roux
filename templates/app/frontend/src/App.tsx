import { Center, Spinner } from "@chakra-ui/react";
import { QueryClientProvider, type QueryClient } from "@tanstack/react-query";
import {
  createRouter,
  RouterProvider,
  type RouterHistory,
} from "@tanstack/react-router";
import { useEffect } from "react";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { ThemeProvider } from "@jwcarman/roux-web/theme";
import { routeTree } from "./routeTree.gen";
import { ColorModeProvider } from "./shell/colorMode";
import { SessionProvider, useSession, type Session } from "@jwcarman/roux-web/session";

/** The app's router: its routes, with the query client their loaders use. `history` is the browser's unless given. */
export function createAppRouter(
  queryClient: QueryClient,
  history?: RouterHistory,
) {
  return createRouter({
    routeTree,
    history,
    // The session is supplied by <App> once it has loaded.
    context: { queryClient, session: undefined! },
    // Pointing at a link loads its page's data before the click.
    defaultPreload: "intent",
    // Back and Forward return to where each page was scrolled.
    scrollRestoration: true,
  });
}

export type AppRouter = ReturnType<typeof createAppRouter>;

declare module "@tanstack/react-router" {
  interface Register {
    router: AppRouter;
  }
}

/** The routes for this session. A new session (signing in or out, or one that ended) runs their guards again. */
function SessionRoutes({
  router,
  session,
}: {
  router: AppRouter;
  session: Session;
}) {
  useEffect(() => {
    void router.invalidate();
  }, [router, session.me]);
  return <RouterProvider router={router} context={{ session }} />;
}

/** The routes once the session has loaded: until then, a spinner. */
function Routes({ router }: { router: AppRouter }) {
  const session = useSession();
  if (session.me === undefined) {
    return (
      <Center py="12">
        <Spinner aria-label="Loading" />
      </Center>
    );
  }
  return <SessionRoutes router={router} session={session} />;
}

/** The whole app: its providers around its routes. main.tsx renders it, and so do the route tests. */
export function App({
  queryClient,
  router,
}: {
  queryClient: QueryClient;
  router: AppRouter;
}) {
  return (
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ColorModeProvider>
          <ConfirmProvider>
            <SessionProvider>
              <Routes router={router} />
            </SessionProvider>
          </ConfirmProvider>
          <Toaster />
        </ColorModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  );
}
