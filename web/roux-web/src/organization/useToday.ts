import { useSyncExternalStore } from "react";
import { onOrganizationChange, today } from "./organization";

/** The organization's today, re-rendering when the day changes (`startDayWatch`). */
export function useToday(): string {
  return useSyncExternalStore(onOrganizationChange, today);
}
