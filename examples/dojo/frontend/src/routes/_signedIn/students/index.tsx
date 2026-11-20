import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { enumSearchOf, idSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";
import { STUDENTS_READ } from "../../../permissions.gen";
import { requirePermission } from "../../../shell/guards";
import { PAYMENT_STATES, STUDENT_SORTS, STUDENT_STATUSES } from "../../../students/students";
import { StudentsPage, STUDENTS_SEARCH_DEFAULTS, type StudentsSearch } from "../../../students/StudentsPage";

export const Route = createFileRoute("/_signedIn/students/")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), STUDENTS_READ),
  validateSearch: (raw: Record<string, unknown>): StudentsSearch => ({
    ...tableSearchOf(raw, STUDENT_SORTS),
    status: enumSearchOf(raw.status, STUDENT_STATUSES),
    rankId: idSearchOf(raw.rankId),
    payment: enumSearchOf(raw.payment, PAYMENT_STATES),
  }),
  search: { middlewares: [stripSearchParams(STUDENTS_SEARCH_DEFAULTS)] },
  component: StudentsPage,
});
