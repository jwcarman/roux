import { mutationOptions, queryOptions, useMutationState } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { queryKeys } from "../queryKeys";

/** A student on a class's check-in list, and whether they are marked present on that date. */
export interface Attendee {
  studentId: string;
  firstName: string;
  lastName: string;
  present: boolean;
}

/** What the check-in screen says about one student: present on `date`, or not. */
export interface AttendanceRequest {
  studentId: string;
  date: string;
  present: boolean;
}

/** `/api/classes/{id}/...` for check-in: one function per endpoint. */
export const attendanceApi = {
  checkIn: (classId: string, date: string, signal?: AbortSignal) =>
    getJson<Attendee[]>(path`classes/${classId}/check-in`, { params: { date }, signal }),
  mark: (classId: string, request: AttendanceRequest) =>
    sendJson<Attendee>("PUT", path`classes/${classId}/attendance`, request),
};

/** Every active student with their mark for the class on `date`. A date the class does not run on is a 400 on `date`. */
export function checkInQuery(classId: string, date: string) {
  return queryOptions({
    queryKey: queryKeys.attendance.checkIn(classId, date),
    queryFn: ({ signal }) => attendanceApi.checkIn(classId, date, signal),
  });
}

/**
 * Marks the student `studentId` present at the class on `date` (`true`) or takes the mark back
 * (`false`). It sends the wanted state, not a toggle, so the server answers a repeat the same way.
 * Marks for one student run one after another (`scope`), so fast taps reach the server in order;
 * the check-in list and the student's own page refresh once each settles, whether it worked or not,
 * which is how a screen that guessed wrong ends up showing the server's truth.
 */
export function markAttendance(classId: string, date: string, studentId: string) {
  return mutationOptions({
    mutationKey: queryKeys.attendance.mark(classId, date, studentId),
    mutationFn: (present: boolean) => attendanceApi.mark(classId, { studentId, date, present }),
    scope: { id: queryKeys.attendance.mark(classId, date, studentId).join("/") },
    meta: { refreshes: [queryKeys.attendance.checkIn(classId, date), queryKeys.students.detail(studentId)] },
  });
}

/**
 * What the student's last mark still waiting for its answer asks for, or undefined when none is.
 * A row shows this before the server answers (an optimistic toggle), and falls back to what the
 * server said when nothing is waiting.
 */
export function usePendingPresence(classId: string, date: string, studentId: string): boolean | undefined {
  const asked = useMutationState({
    filters: { mutationKey: queryKeys.attendance.mark(classId, date, studentId), status: "pending" },
    select: (mutation) => mutation.state.variables,
  });
  return asked.filter((variables): variables is boolean => typeof variables === "boolean").at(-1);
}
