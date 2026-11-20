import type { QueryClient } from "@tanstack/react-query";
import { fetchOrganization, organization, setOrganization, type OrganizationContext } from "./organization";

/** How long the browser waits to ask again when the server failed or still said today. */
export const RETRY_MS = 60_000;

/** The longest a timer can wait (2^31 - 1 ms, about 24.8 days); a longer one would fire at once. */
const LONGEST_WAIT = 2 ** 31 - 1;

/**
 * Moves the app to the organization's next day when today ends: at `todayEndsAt`, and when a tab
 * becomes visible after it (a device that slept through it), it asks the server. A new day is set,
 * and every query is refreshed (overdue, this month and totals all hang off today). A failure, or
 * the same day (a device clock ahead of the server's), keeps the day and asks again a minute later.
 * Call it once in `main.tsx`; it returns the function that stops it.
 */
export function startDayWatch(
  queryClient: QueryClient,
  fetchContext: () => Promise<OrganizationContext> = fetchOrganization,
): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let stopped = false;
  // One question at a time: on waking, the overdue timer and the tab becoming visible fire together,
  // and a second answer of "the same day" would start a minute's retry beside the next day's timer.
  let asking: Promise<void> | undefined;

  const untilDayEnds = () => Date.parse(organization().todayEndsAt) - Date.now();
  // A timer that fires before the day has ended (a wait longer than a timer allows, taken in steps)
  // waits out the rest; otherwise it asks.
  const schedule = (delay: number) => {
    timer = setTimeout(
      () => (untilDayEnds() > 0 ? schedule(untilDayEnds()) : void check()),
      Math.min(LONGEST_WAIT, Math.max(0, delay)),
    );
  };

  function check(): Promise<void> {
    asking ??= ask().finally(() => {
      asking = undefined;
    });
    return asking;
  }

  async function ask() {
    clearTimeout(timer);
    try {
      const next = await fetchContext();
      if (stopped) {
        return;
      }
      if (next.today !== organization().today) {
        setOrganization(next);
        void queryClient.invalidateQueries();
        schedule(untilDayEnds());
        return;
      }
    } catch {
      // Keep the day: the server checks every date anyway.
    }
    if (!stopped) {
      schedule(RETRY_MS);
    }
  }

  const onVisible = () => {
    if (document.visibilityState === "visible" && untilDayEnds() <= 0) {
      void check();
    }
  };

  document.addEventListener("visibilitychange", onVisible);
  schedule(untilDayEnds());
  return () => {
    stopped = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", onVisible);
  };
}
