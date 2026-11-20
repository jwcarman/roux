import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { USERS_READ } from "../../../permissions.gen";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { requirePermission } from "../../../shell/guards";
import { MemberDetail } from "../../../members/MemberDetail";
import { memberQuery } from "../../../members/members";

/** A member's page. The loader fetches the member first; a member that does not exist is a 404. */
export const Route = createFileRoute("/_signedIn/members/$memberId")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), USERS_READ),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(memberQuery(params.memberId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="Member not found" />,
  component: MemberDetail,
});
