import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { ATTENDANCE_RECORD } from "../../../../api";
import { CheckInPage } from "../../../../attendance/CheckInPage";
import { classQuery } from "../../../../classes/classes";
import { isoDateOf } from "../../../../shell/dates";
import { requirePermission } from "../../../../shell/guards";

/** A class's check-in for `date` (today when the URL has none). The loader fetches the class first. */
export const Route = createFileRoute("/_signedIn/classes/$classId/check-in")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), ATTENDANCE_RECORD),
  validateSearch: (raw: Record<string, unknown>): { date?: string } => ({ date: isoDateOf(raw.date) }),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(classQuery(params.classId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="Class not found" />,
  component: CheckInPage,
});
