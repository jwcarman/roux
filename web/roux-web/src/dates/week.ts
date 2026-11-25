import { startOfWeek } from "date-fns";
import { organization } from "../organization/organization";
import { formatIsoDate, parseIsoDate } from "./dates";

/**
 * The first day of the organization's week (`ORG_WEEK_START`, or where its locale starts the week)
 * that holds `day`: with weeks starting on Sunday, `2026-11-25` (a Wednesday) is in the week of
 * `2026-11-22`. A week view starts from `firstDayOfWeek(today())`. `day` must be a real date
 * (`today()`, or one `dateSearchOf` let through).
 */
export function firstDayOfWeek(day: string): string {
  const date = parseIsoDate(day);
  if (date === undefined) {
    throw new Error(`firstDayOfWeek: "${day}" is not a date (yyyy-mm-dd); read a URL's with dateSearchOf`);
  }
  return formatIsoDate(startOfWeek(date, { weekStartsOn: organization().weekStart }));
}
