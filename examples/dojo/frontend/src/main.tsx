import { Center, Spinner } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { ColorModeProvider } from "./shell/colorMode";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { routeTree } from "./routeTree.gen";
import { SessionProvider, useSession } from "./shell/session";
import { loadOrganization, startDayWatch } from "@jwcarman/roux-web/organization";
import { ThemeProvider } from "@jwcarman/roux-web/theme";

const queryClient = createQueryClient();

const router = createRouter({
  routeTree,
  // The session is supplied by <App> once it has loaded.
  context: { queryClient, session: undefined! },
  defaultPreload: "intent",
  scrollRestoration: true,
});

declare module "@tanstack/react-router" {
  interface Register {
    router: typeof router;
  }
}

/** Renders the routes once the session has loaded, and re-runs their guards when it changes. */
function App() {
  const session = useSession();
  useEffect(() => {
    if (session.me !== undefined) {
      void router.invalidate();
    }
  }, [session.me]);

  if (session.me === undefined) {
    return (
      <Center py="12">
        <Spinner aria-label="Loading" />
      </Center>
    );
  }
  return <RouterProvider router={router} context={{ session }} />;
}

// The school's zone, locale, currency and today: in the page the server sent, or (Vite's dev server)
// asked for before anything renders. Then the app moves to the next day when the school's day ends.
await loadOrganization();
startDayWatch(queryClient);

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider>
        <ColorModeProvider>
          <ConfirmProvider>
            <SessionProvider>
              <App />
            </SessionProvider>
          </ConfirmProvider>
          <Toaster />
        </ColorModeProvider>
      </ThemeProvider>
    </QueryClientProvider>
  </StrictMode>,
);
