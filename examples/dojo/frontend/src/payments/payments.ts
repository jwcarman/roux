import { queryOptions } from "@tanstack/react-query";
import { getJson } from "@jwcarman/roux-web/api";
import type { Money } from "@jwcarman/roux-web/money";
import {
  pageQuery,
  type PageDto,
  type PageParams,
} from "@jwcarman/roux-web/paging";
import type { PaymentMethod } from "../memberships/memberships";
import { queryKeys } from "../queryKeys";
import { organization } from "@jwcarman/roux-web/organization";

/** Money taken in one month (`"2026-04"`); zero when nothing was. */
export interface MonthlyTotal {
  month: string;
  total: Money;
}

/** A payment on the Payments page. */
export interface PaymentListEntry {
  id: string;
  takenOn: string;
  studentId: string;
  studentName: string;
  planName: string;
  periods: number;
  amount: Money;
  method: PaymentMethod;
  recordedByName: string;
}

/** `/api/payments`: one function per endpoint. */
export const paymentsApi = {
  monthly: (signal?: AbortSignal) =>
    getJson<MonthlyTotal[]>("payments/monthly", { signal }),
  thisMonth: (params: PageParams, signal?: AbortSignal) =>
    getJson<PageDto<PaymentListEntry>>("payments", { params, signal }),
};

/** The last twelve months, oldest first, ending with this one (the server's month). */
export const monthlyTotalsQuery = queryOptions({
  queryKey: [...queryKeys.payments.all, "monthly"] as const,
  queryFn: ({ signal }) => paymentsApi.monthly(signal),
});

/** This month's payments, newest first, as a QueryTable takes them. */
export const thisMonthsPayments = pageQuery(
  [...queryKeys.payments.all, "this-month"] as const,
  (params, signal) => paymentsApi.thisMonth(params, signal),
);

/** `"2026-04"` as the school writes a month ("Apr 2026"); a month is the same in every zone. */
export function formatMonth(month: string): string {
  const months = new Intl.DateTimeFormat(organization().locale, {
    month: "short",
    year: "numeric",
    timeZone: "UTC",
  });
  return months.format(new Date(`${month}-01T00:00:00Z`));
}
