import {
  createMemoryHistory,
  createRootRoute,
  createRoute,
  createRouter,
  Outlet,
  RouterProvider,
} from "@tanstack/react-router";
import type { ReactNode } from "react";
import { renderWithProviders } from "./render";

/*
 * A small route tree for tests that need a router: Home, Members, Ranks and Settings, with the page
 * under test drawn above the active route. Registering the router types every `to` in the test
 * program, as an app's generated route tree does in the app, so a test can show a misspelt route is
 * a type error.
 */
function tree(ui: ReactNode) {
  const root = createRootRoute({
    component: () => (
      <>
        {ui}
        <Outlet />
      </>
    ),
  });
  const home = createRoute({ getParentRoute: () => root, path: "/", component: () => <h2>Home page</h2> });
  const members = createRoute({ getParentRoute: () => root, path: "/members", component: () => <h2>Members page</h2> });
  const ranks = createRoute({ getParentRoute: () => root, path: "/ranks", component: () => <h2>Ranks page</h2> });
  const settings = createRoute({
    getParentRoute: () => root,
    path: "/settings",
    component: () => <h2>Settings page</h2>,
  });
  return root.addChildren([home, members, ranks, settings]);
}

function makeRouter(ui: ReactNode, path: string) {
  return createRouter({ routeTree: tree(ui), history: createMemoryHistory({ initialEntries: [path] }) });
}

declare module "@tanstack/react-router" {
  interface Register {
    router: ReturnType<typeof makeRouter>;
  }
}

/**
 * Renders `ui` in the root route, above the page at `path`, inside the Chakra and query providers.
 * The router starts asynchronously: await a `findBy` query.
 */
export function renderInRouter(ui: ReactNode, path = "/") {
  const router = makeRouter(ui, path);
  return { router, ...renderWithProviders(<RouterProvider router={router} />) };
}
