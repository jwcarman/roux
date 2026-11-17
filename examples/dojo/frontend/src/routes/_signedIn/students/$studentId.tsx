import { createFileRoute, notFound } from "@tanstack/react-router";
import { ApiError } from "@jwcarman/roux-web/api";
import { NotFoundPage } from "@jwcarman/roux-web/feedback";
import { STUDENTS_READ } from "../../../api";
import { requirePermission } from "../../../shell/guards";
import { StudentPage } from "../../../students/StudentPage";
import { studentQuery } from "../../../students/students";

/** A student's page. The loader fetches the student first; one that does not exist is a 404. */
export const Route = createFileRoute("/_signedIn/students/$studentId")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), STUDENTS_READ),
  loader: async ({ context, params }) => {
    try {
      await context.queryClient.ensureQueryData(studentQuery(params.studentId));
    } catch (error) {
      if (error instanceof ApiError && error.status === 404) {
        throw notFound();
      }
      throw error;
    }
  },
  notFoundComponent: () => <NotFoundPage title="Student not found" />,
  component: StudentPage,
});
