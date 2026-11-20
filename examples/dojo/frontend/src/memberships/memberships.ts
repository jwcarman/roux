import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { date, id, integer, oneOf, text } from "@jwcarman/roux-web/form";
import type { Money } from "@jwcarman/roux-web/money";
import { z } from "zod";
import type { PlanPeriod } from "../plans/plans";
import { queryKeys } from "../queryKeys";

/** How a payment was taken: the server's PaymentMethod. */
export const PAYMENT_METHODS = ["CASH", "CARD", "CHEQUE", "OTHER"] as const;
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

/** Each method as the page writes it. */
export const PAYMENT_METHOD_LABELS: Record<PaymentMethod, string> = {
  CASH: "Cash",
  CARD: "Card",
  CHEQUE: "Cheque",
  OTHER: "Other",
};

/** A payment on a student's page; `recordedByName` is "Unknown" when the recorder has no profile. */
export interface PaymentView {
  id: string;
  takenOn: string;
  periods: number;
  amount: Money;
  method: PaymentMethod;
  note: string | null;
  recordedByName: string;
}

/** A membership, with paid through (the last day paid for) and its payments, newest first. */
export interface MembershipView {
  id: string;
  plan: { id: string; name: string; price: Money; period: PlanPeriod };
  startDate: string;
  endDate: string | null;
  paidThrough: string;
  overdue: boolean;
  payments: PaymentView[];
}

/** A student's current membership (null if they never had one) and the ended ones, newest first. */
export interface StudentMemberships {
  current: MembershipView | null;
  past: MembershipView[];
}

/** The day after `iso` (`YYYY-MM-DD`). */
function nextDay(iso: string): string {
  const day = new Date(`${iso}T00:00:00Z`);
  day.setUTCDate(day.getUTCDate() + 1);
  return day.toISOString().slice(0, 10);
}

/**
 * A new membership's start: the day after the current one's paid through when the student is paid
 * through today or later (a change of plan takes effect when the paid time runs out), else today;
 * and never on or before the current one's start, which the server refuses.
 */
export function defaultStartDate(current: MembershipView | null, today: string): string {
  if (current === null) {
    return today;
  }
  const candidates = [today, nextDay(current.paidThrough), nextDay(current.startDate)];
  return candidates.reduce((latest, day) => (day > latest ? day : latest));
}

/** MembershipRequest's rules, in the server's words. */
export const membershipRequestSchema = z.object({
  planId: id(),
  startDate: date(),
});

export type MembershipRequest = z.output<typeof membershipRequestSchema>;

/** PaymentRequest's rules, in the server's words. */
export const paymentRequestSchema = z.object({
  periods: integer().min(1).max(12),
  takenOn: date().notInFuture(),
  method: oneOf(PAYMENT_METHODS),
  note: text().max(200).optional(),
});

export type PaymentRequest = z.output<typeof paymentRequestSchema>;

/** `/api/students/{id}/memberships` and `/payments`: one function per endpoint. */
export const membershipsApi = {
  get: (studentId: string, signal?: AbortSignal) =>
    getJson<StudentMemberships>(path`students/${studentId}/memberships`, { signal }),
  start: (studentId: string, request: MembershipRequest) =>
    sendJson<MembershipView>("POST", path`students/${studentId}/memberships`, request),
  record: (studentId: string, request: PaymentRequest) =>
    sendJson<PaymentView>("POST", path`students/${studentId}/payments`, request),
  remove: (studentId: string, paymentId: string) =>
    sendJson<void>("DELETE", path`students/${studentId}/payments/${paymentId}`),
};

/** A student's memberships and payments. */
export function membershipsQuery(studentId: string) {
  return queryOptions({
    queryKey: queryKeys.students.memberships(studentId),
    queryFn: ({ signal }) => membershipsApi.get(studentId, signal),
  });
}

/**
 * What a membership or payment change refreshes: the student's memberships, the students list (its
 * plan and paid-through columns), the Payments page, and the plans (one becomes in use).
 */
function refreshes(studentId: string) {
  return {
    refreshes: [
      queryKeys.students.memberships(studentId),
      queryKeys.students.activities(studentId),
      queryKeys.students.lists(),
      queryKeys.payments.all,
      queryKeys.plans.all,
    ],
  };
}

/** Puts the student on a plan from a date; the current membership ends the day before. */
export const startMembership = (studentId: string) =>
  mutationOptions({
    mutationFn: (request: MembershipRequest) => membershipsApi.start(studentId, request),
    meta: refreshes(studentId),
  });

/** Records a payment on the current membership; the server prices it. */
export const recordPayment = (studentId: string) =>
  mutationOptions({
    mutationFn: (request: PaymentRequest) => membershipsApi.record(studentId, request),
    meta: refreshes(studentId),
  });

/** Removes a mistaken payment; paid through moves back. */
export const removePayment = (studentId: string) =>
  mutationOptions({
    mutationFn: (paymentId: string) => membershipsApi.remove(studentId, paymentId),
    meta: refreshes(studentId),
  });
