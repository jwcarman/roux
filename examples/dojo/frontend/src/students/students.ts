import { mutationOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { date, email, phone, text } from "@jwcarman/roux-web/form";
import { pageQuery, type PageDto, type PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import { queryKeys } from "../queryKeys";
import { NOT_IN_THE_FUTURE, notInTheFuture } from "../shell/dates";
import type { Rank } from "../ranks/ranks";

/** The statuses a student can have: the server's StudentStatus enum. */
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** The list's sorts: the column ids, and `StudentSort`'s values on the server. */
export const STUDENT_SORTS = ["NAME", "START_DATE", "RANK"] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

/** A student as `/api/students` answers it; `currentRank` is the latest promotion's, or null. */
export interface Student {
  id: string;
  firstName: string;
  lastName: string;
  email: string | null;
  phone: string | null;
  birthDate: string | null;
  startDate: string;
  status: StudentStatus;
  currentRank: Rank | null;
  version: number;
}

/** A student as their own page shows them. */
export type StudentDetail = Student;

/** The list's filters, as `/api/students` takes them (`rankId` is the current rank's). */
export interface StudentFilters {
  search?: string;
  status?: StudentStatus;
  rankId?: string;
}

/** StudentRequest's rules (without the version), in the server's words. */
export const studentRequestSchema = z.object({
  firstName: text().max(80),
  lastName: text().max(80),
  email: email().max(320).optional(),
  phone: phone().max(30).optional(),
  birthDate: date()
    .optional()
    .refine(notInTheFuture, { error: NOT_IN_THE_FUTURE }),
  startDate: date(),
});

/** What a student form sends: trimmed, a blank email, phone or birth date as null. */
export type StudentRequest = z.output<typeof studentRequestSchema>;

/** What a manager can do to a student's status: the endpoint under `/api/students/{id}/`. */
export type StudentStatusAction = "deactivate" | "reactivate";

/** `/api/students`: one function per endpoint. */
export const studentsApi = {
  list: (params: PageParams & StudentFilters, signal?: AbortSignal) =>
    getJson<PageDto<Student>>("students", { params, signal }),
  create: (request: StudentRequest) => sendJson<StudentDetail>("POST", "students", request),
  update: (id: string, request: StudentRequest & { version: number }) =>
    sendJson<StudentDetail>("PUT", path`students/${id}`, request),
  changeStatus: (id: string, action: StudentStatusAction) =>
    sendJson<StudentDetail>("POST", path`students/${id}/${action}`),
};

/** The student list under `filters`, as a QueryTable takes it: its key and how to fetch a page. */
export function studentsPage(filters: StudentFilters) {
  return pageQuery(queryKeys.students.list(filters), (params, signal) =>
    studentsApi.list({ ...params, ...filters }, signal),
  );
}

/** Adds a student; the list refreshes. */
export const createStudent = mutationOptions({
  mutationFn: (request: StudentRequest) => studentsApi.create(request),
  meta: { refreshes: [queryKeys.students.lists()] },
});

/** Saves a student at the `version` it was read at; a change made since answers 409. */
export const updateStudent = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: StudentRequest) => studentsApi.update(id, { ...request, version }),
    meta: { refreshes: [queryKeys.students.detail(id), queryKeys.students.lists()] },
  });

/** Deactivates or reactivates the student `id`; their page and the list refresh. */
export const changeStudentStatus = (id: string) =>
  mutationOptions({
    mutationFn: ({ action }: { action: StudentStatusAction }) => studentsApi.changeStatus(id, action),
    meta: { refreshes: [queryKeys.students.detail(id), queryKeys.students.lists()] },
  });
