import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter } from "@tanstack/react-router";
import { ErrorPage, NotFoundPage } from "@jwcarman/roux-web/feedback";
import { Layout } from "../shell/Layout";
import type { Session } from "../shell/session";

/** What every route's `beforeLoad` and `loader` can use. */
export interface RouterContext {
  queryClient: QueryClient;
  session: Session;
}

/** Retrying runs the routes' loaders again, which also clears the failure. */
function RouteError() {
  const router = useRouter();
  return <ErrorPage onRetry={() => void router.invalidate()} />;
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: RouteError,
});
