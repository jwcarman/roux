import { queryOptions } from "@tanstack/react-query";
import { getJson, optimisticMutation, path, sendJson } from "@jwcarman/roux-web/api";
import { pageQuery, type PageDto } from "@jwcarman/roux-web/paging";
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

/** A class a student attended, as their page lists it (newest first). */
export interface StudentAttendance {
  id: string;
  date: string;
  classId: string;
  className: string;
}

/** How many classes a student attended after their current rank's promotion (all, when never promoted). */
export interface SincePromotion {
  classes: number;
  promotedOn: string | null;
}

/** The attendance endpoints: check-in under a class, history under a student. */
export const attendanceApi = {
  checkIn: (classId: string, date: string, signal?: AbortSignal) =>
    getJson<Attendee[]>(path`classes/${classId}/check-in`, { params: { date }, signal }),
  mark: (classId: string, request: AttendanceRequest) =>
    sendJson<Attendee>("PUT", path`classes/${classId}/attendance`, request),
  forStudent: (studentId: string, pageIndex: number, signal?: AbortSignal) =>
    getJson<PageDto<StudentAttendance>>(path`students/${studentId}/attendance`, {
      params: { pageIndex, pageSize: 20 },
      signal,
    }),
  sincePromotion: (studentId: string, signal?: AbortSignal) =>
    getJson<SincePromotion>(path`students/${studentId}/attendance/since-promotion`, { signal }),
};

/** A student's attendance, newest first, as an InfiniteList takes it: its key and how to fetch a page. */
export function attendancePage(studentId: string) {
  return pageQuery(queryKeys.students.attendance(studentId), ({ pageIndex = 0 }, signal) =>
    attendanceApi.forStudent(studentId, pageIndex, signal),
  );
}

/** The classes the student attended since their current rank's promotion. */
export function sincePromotionQuery(studentId: string) {
  return queryOptions({
    queryKey: queryKeys.students.sincePromotion(studentId),
    queryFn: ({ signal }) => attendanceApi.sincePromotion(studentId, signal),
  });
}

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
 * `optimisticMutation` keys it by the student, so fast taps reach the server in order and the row
 * can show the latest one before the server answers; the check-in list and the student's own page
 * refresh once each settles, which is how a screen that guessed wrong ends up showing the server's
 * truth.
 */
export function markAttendance(classId: string, date: string, studentId: string) {
  return optimisticMutation(queryKeys.attendance.mark(classId, date, studentId), {
    mutationFn: (present: boolean) => attendanceApi.mark(classId, { studentId, date, present }),
    meta: { refreshes: [queryKeys.attendance.checkIn(classId, date), queryKeys.students.detail(studentId)] },
  });
}
