import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { money, oneOf, text } from "@jwcarman/roux-web/form";
import { formatMoney, type Money, type MoneySettings } from "@jwcarman/roux-web/money";
import { z } from "zod";
import { queryKeys } from "../queryKeys";

/** How long one payment of a plan's price lasts: the server's PlanPeriod. */
export const PLAN_PERIODS = ["MONTHLY", "YEARLY"] as const;
export type PlanPeriod = (typeof PLAN_PERIODS)[number];

/** A plan as `/api/plans` answers it; `inUse` once a membership has used it (then it can only be made inactive). */
export interface Plan {
  id: string;
  name: string;
  price: Money;
  period: PlanPeriod;
  active: boolean;
  inUse: boolean;
  version: number;
}

/** "$150.00 / month". */
export function pricePerPeriod(plan: Pick<Plan, "price" | "period">): string {
  return `${formatMoney(plan.price)} / ${plan.period === "YEARLY" ? "year" : "month"}`;
}

/** PlanRequest's rules (without the version), in the server's words, in the school's currency. */
export function planSchema(settings: MoneySettings) {
  return z.object({
    name: text().max(60),
    price: money(settings).positive(),
    period: oneOf(PLAN_PERIODS),
    active: z.boolean(),
  });
}

/** What a plan form sends. */
export type PlanRequest = z.output<ReturnType<typeof planSchema>>;

/** `/api/plans`: one function per endpoint. */
export const plansApi = {
  list: (signal?: AbortSignal) => getJson<Plan[]>("plans", { signal }),
  active: (signal?: AbortSignal) => getJson<Plan[]>("plans/active", { signal }),
  create: (request: PlanRequest) => sendJson<Plan>("POST", "plans", request),
  update: (id: string, request: PlanRequest & { version: number }) => sendJson<Plan>("PUT", path`plans/${id}`, request),
  remove: (id: string) => sendJson<void>("DELETE", path`plans/${id}`),
};

/** Every plan, by name, for the Plans page. */
export const plansQuery = queryOptions({
  queryKey: queryKeys.plans.lists(),
  queryFn: ({ signal }) => plansApi.list(signal),
});

/** The plans offered for new memberships, by name. */
export const activePlansQuery = queryOptions({
  queryKey: queryKeys.plans.active(),
  queryFn: ({ signal }) => plansApi.active(signal),
});

/**
 * What a plan's change refreshes: the plans, and the students' memberships, which show each plan's
 * name and price as they were fetched.
 */
const refreshesPlans = { refreshes: [queryKeys.plans.all, queryKeys.students.all] };

/** Adds a plan. */
export const createPlan = mutationOptions({
  mutationFn: (request: PlanRequest) => plansApi.create(request),
  meta: { refreshes: [queryKeys.plans.all] },
});

/** Saves a plan at the `version` it was read at; a change made since answers 409. */
export const updatePlan = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (request: PlanRequest) => plansApi.update(id, { ...request, version }),
    meta: refreshesPlans,
  });

/** Removes a plan no membership has used; a used one is refused (400). */
export const removePlan = mutationOptions({ mutationFn: (id: string) => plansApi.remove(id), meta: refreshesPlans });
