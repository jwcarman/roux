import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { date, email, id, phone, text } from "@jwcarman/roux-web/form";
import { historyQuery } from "@jwcarman/roux-web/activity";
import { pageQuery, type PageDto, type PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import { queryKeys } from "../queryKeys";
import type { Rank } from "../ranks/ranks";

/** The statuses a student can have: the server's StudentStatus enum. */
export const STUDENT_STATUSES = ["ACTIVE", "INACTIVE"] as const;
export type StudentStatus = (typeof STUDENT_STATUSES)[number];

/** The list's sorts: the column ids, and `StudentSort`'s values on the server. */
export const STUDENT_SORTS = ["NAME", "START_DATE", "RANK", "PAID_THROUGH"] as const;
export type StudentSort = (typeof STUDENT_SORTS)[number];

/** Where a student stands on paying: the server's PaymentState. */
export const PAYMENT_STATES = ["PAID", "OVERDUE", "NONE"] as const;
export type PaymentState = (typeof PAYMENT_STATES)[number];

/**
 * A student as `/api/students` answers it; `currentRank` is the latest promotion's, or null. The
 * list's rows carry `planName`, `paidThrough` and `payment` for a caller with `payments.record`
 * (null otherwise); a student's own page has none of them.
 */
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
  planName?: string | null;
  paidThrough?: string | null;
  payment?: PaymentState | null;
}

/** A promotion as `/api/students/{id}` lists it. */
export interface Promotion {
  id: string;
  rank: Rank;
  date: string;
}

/** A student as their own page shows them: the promotions are newest first. */
export interface StudentDetail extends Student {
  promotions: Promotion[];
}

/** The list's filters, as `/api/students` takes them (`rankId` is the current rank's). */
export interface StudentFilters {
  search?: string;
  status?: StudentStatus;
  rankId?: string;
  payment?: PaymentState;
}

/** StudentRequest's rules (without the version), in the server's words. */
export const studentRequestSchema = z.object({
  firstName: text().max(80),
  lastName: text().max(80),
  email: email().max(320).optional(),
  phone: phone().max(30).optional(),
  birthDate: date().notInFuture().optional(),
  startDate: date(),
});

/** What a student form sends: trimmed, a blank email, phone or birth date as null. */
export type StudentRequest = z.output<typeof studentRequestSchema>;

/** PromotionRequest's rules, in the server's words. */
export const promotionRequestSchema = z.object({
  rankId: id(),
  date: date().notInFuture(),
});

/** What the promotion form sends. */
export type PromotionRequest = z.output<typeof promotionRequestSchema>;

/** What a manager can do to a student's status: the endpoint under `/api/students/{id}/`. */
export type StudentStatusAction = "deactivate" | "reactivate";

/** `/api/students`: one function per endpoint. */
export const studentsApi = {
  list: (params: PageParams & StudentFilters, signal?: AbortSignal) =>
    getJson<PageDto<Student>>("students", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<StudentDetail>(path`students/${id}`, { signal }),
  create: (request: StudentRequest) => sendJson<StudentDetail>("POST", "students", request),
  update: (id: string, request: StudentRequest & { version: number }) =>
    sendJson<StudentDetail>("PUT", path`students/${id}`, request),
  changeStatus: (id: string, action: StudentStatusAction) =>
    sendJson<StudentDetail>("POST", path`students/${id}/${action}`),
  promote: (id: string, request: PromotionRequest) =>
    sendJson<StudentDetail>("POST", path`students/${id}/promotions`, request),
  removePromotion: (id: string, promotionId: string) =>
    sendJson<StudentDetail>("DELETE", path`students/${id}/promotions/${promotionId}`),
};

/** A student, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function studentQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.students.detail(id),
    queryFn: ({ signal }) => studentsApi.get(id, signal),
  });
}

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

/** Promotes the student `id`; their page and the list (the current rank) refresh. */
export const promoteStudent = (id: string) =>
  mutationOptions({
    mutationFn: (request: PromotionRequest) => studentsApi.promote(id, request),
    meta: { refreshes: [queryKeys.students.detail(id), queryKeys.students.lists()] },
  });

/** Takes a promotion of the student `studentId` back; the current rank is recomputed. */
export const removePromotion = (studentId: string) =>
  mutationOptions({
    mutationFn: (promotionId: string) => studentsApi.removePromotion(studentId, promotionId),
    meta: { refreshes: [queryKeys.students.detail(studentId), queryKeys.students.lists()] },
  });

/** A student's history (memberships, payments, promotions), newest first, as an ActivityList takes it. */
export function studentActivitiesPage(id: string) {
  return historyQuery(queryKeys.students.activities(id), path`students/${id}/activities`);
}
