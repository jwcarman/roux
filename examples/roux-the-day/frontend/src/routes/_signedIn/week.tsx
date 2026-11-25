import { createFileRoute } from "@tanstack/react-router";
import { requirePermission } from "@jwcarman/roux-web/session";
import { parseIsoDate } from "@jwcarman/roux-web/dates";
import { ITEMS_READ } from "../../permissions.gen";
import { Week, type WeekSearch } from "../../items/WeekPage";

export const Route = createFileRoute("/_signedIn/week")({
  beforeLoad: ({ context }) => requirePermission(context.me, ITEMS_READ),
  validateSearch: (raw: Record<string, unknown>): WeekSearch => ({
    week: typeof raw.week === "string" && parseIsoDate(raw.week) ? raw.week : undefined,
    assignee: raw.assignee === "me" ? "me" : undefined,
  }),
  component: Week,
});
