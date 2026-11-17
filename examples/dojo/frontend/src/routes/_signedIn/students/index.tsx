import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { enumSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";
import { STUDENTS_READ } from "../../../api";
import { requirePermission } from "../../../shell/guards";
import { STUDENT_SORTS, STUDENT_STATUSES } from "../../../students/students";
import { StudentsPage, STUDENTS_SEARCH_DEFAULTS, type StudentsSearch } from "../../../students/StudentsPage";

export const Route = createFileRoute("/_signedIn/students/")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), STUDENTS_READ),
  validateSearch: (raw: Record<string, unknown>): StudentsSearch => ({
    ...tableSearchOf(raw, STUDENT_SORTS),
    status: enumSearchOf(raw.status, STUDENT_STATUSES),
    // A rank's id is not in a fixed set, so enumSearchOf cannot check it: any non-blank text will do,
    // and the server answers an id nobody holds with an empty list.
    rankId: typeof raw.rankId === "string" && raw.rankId.trim() !== "" ? raw.rankId : undefined,
  }),
  search: { middlewares: [stripSearchParams(STUDENTS_SEARCH_DEFAULTS)] },
  component: StudentsPage,
});
