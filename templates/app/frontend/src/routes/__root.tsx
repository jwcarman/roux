import type { QueryClient } from "@tanstack/react-query";
import { createRootRouteWithContext, useRouter, type ErrorComponentProps } from "@tanstack/react-router";
import { ErrorPage, NotFoundPage } from "@jwcarman/roux-web/feedback";
import { Layout } from "../shell/Layout";
import type { Session } from "../shell/session";

/** What every route's `beforeLoad` and `loader` can use. */
export interface RouterContext {
  queryClient: QueryClient;
  session: Session;
}

/** Retrying clears the failure and runs the routes' loaders again. */
function RouteError({ reset }: ErrorComponentProps) {
  const router = useRouter();
  return (
    <ErrorPage
      onRetry={() => {
        reset();
        void router.invalidate();
      }}
    />
  );
}

export const Route = createRootRouteWithContext<RouterContext>()({
  component: Layout,
  notFoundComponent: () => <NotFoundPage />,
  errorComponent: RouteError,
});
