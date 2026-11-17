import { Center, Spinner } from "@chakra-ui/react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { createRouter, RouterProvider } from "@tanstack/react-router";
import { StrictMode, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { createQueryClient } from "@jwcarman/roux-web/api";
import { ColorModeProvider } from "./shell/colorMode";
import { ConfirmProvider, Toaster } from "@jwcarman/roux-web/feedback";
import { cspNonce } from "./shell/csp";
import { routeTree } from "./routeTree.gen";
import { SessionProvider, useSession } from "./shell/session";
import { readPageTheme } from "./shell/theme";
import { ThemeProvider } from "./shell/themeContext";

const queryClient = createQueryClient();

// Chakra styles through Emotion, which adds <style> tags at runtime: they carry the page's nonce,
// or the Content-Security-Policy refuses them.
const styleCache = createCache({ key: "css", nonce: cspNonce() });

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

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <CacheProvider value={styleCache}>
        <ThemeProvider initial={readPageTheme()}>
          <ColorModeProvider>
            <ConfirmProvider>
              <SessionProvider>
                <App />
              </SessionProvider>
            </ConfirmProvider>
            <Toaster />
          </ColorModeProvider>
        </ThemeProvider>
      </CacheProvider>
    </QueryClientProvider>
  </StrictMode>,
);
