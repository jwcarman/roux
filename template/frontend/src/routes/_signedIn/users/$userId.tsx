import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { USERS_READ } from "../../../permissions.gen";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { requirePermission } from "@jwcarman/roux-web/session";
import { UserDetail } from "../../../users/UserDetail";
import { userQuery } from "@jwcarman/roux-web/users";

/** A user's page. The loader fetches the user first; a user that does not exist is a 404. */
export const Route = createFileRoute("/_signedIn/users/$userId")({
  beforeLoad: ({ context }) => requirePermission(context.me, USERS_READ),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(userQuery(params.userId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="User not found" />,
  component: UserDetail,
});
