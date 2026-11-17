import type { IconType } from "react-icons";
import {
  LuCalendar,
  LuChartBar,
  LuCheck,
  LuClipboard,
  LuFolder,
  LuHouse,
  LuInbox,
  LuList,
  LuPalette,
  LuSettings,
  LuStar,
  LuUsers,
} from "react-icons/lu";
import type { Me } from "../api";
import navJson from "./nav.json";
import type { FileRoutesByTo } from "../routeTree.gen";

/** A page in the sidebar. */
export interface NavItem {
  label: string;
  to: keyof FileRoutesByTo;
  icon: IconType;
  /** The permission the page needs; the item is hidden from callers without it. */
  permission?: string;
  /** What the page is for, in one sentence an owner would understand. */
  description: string;
  /** Whether the app opens on this page; exactly one place has it. */
  start: boolean;
}

/** The icons a place in `nav.json` may name. A new icon is one more entry here. */
export const ICONS: Readonly<Record<string, IconType>> = {
  house: LuHouse,
  users: LuUsers,
  palette: LuPalette,
  settings: LuSettings,
  inbox: LuInbox,
  folder: LuFolder,
  list: LuList,
  calendar: LuCalendar,
  check: LuCheck,
  star: LuStar,
  clipboard: LuClipboard,
  chart: LuChartBar,
};

/** One place as `nav.json` writes it. */
interface NavEntry {
  label: string;
  to: string;
  icon: string;
  permission?: string;
  description: string;
  start?: boolean;
}

/** The sidebar, in order, from `nav.json`. A new feature's page is one more entry there. */
export const NAV_ITEMS: readonly NavItem[] = (navJson as NavEntry[]).map((entry) => ({
  label: entry.label,
  // nav.test.ts checks that every place links to a page that exists.
  to: entry.to as keyof FileRoutesByTo,
  icon: ICONS[entry.icon],
  permission: entry.permission,
  description: entry.description,
  start: entry.start === true,
}));

/** The items `me` may open: none when signed out. */
export function navItemsFor(me: Me | null | undefined, items: readonly NavItem[] = NAV_ITEMS): NavItem[] {
  if (!me) {
    return [];
  }
  return items.filter((item) => item.permission === undefined || me.permissions.includes(item.permission));
}

/**
 * Where `/` sends `me`: the start place, when it is not `/` and `me` may open it; otherwise null,
 * and `/` shows Home. A start place `me` may not open never redirects, so guards that send people
 * to `/` cannot loop.
 */
export function startPathFor(
  me: Me | null | undefined,
  items: readonly NavItem[] = NAV_ITEMS,
): keyof FileRoutesByTo | null {
  const start = navItemsFor(me, items).find((item) => item.start);
  return start && start.to !== "/" ? start.to : null;
}

/**
 * Where opening `/` sends `me`: the start place, unless `home` says a guard sent them to Home (so a
 * start place that refuses them cannot loop); null shows Home.
 */
export function openingRedirect(
  me: Me | null | undefined,
  home: boolean,
  items: readonly NavItem[] = NAV_ITEMS,
): keyof FileRoutesByTo | null {
  return home ? null : startPathFor(me, items);
}

/** A place as `nav.json` writes it, for {@link placeProblems}. */
export interface PlaceEntry {
  label: string;
  to: string;
  start?: boolean;
}

/** What is wrong with the places in `nav.json` beyond their shape; empty when nothing is. */
export function placeProblems(entries: readonly PlaceEntry[]): string[] {
  const start = entries.find((entry) => entry.start === true);
  const home = entries.find((entry) => entry.to === "/");
  if (start && home && start.to !== "/") {
    return [
      `${home.label} (/) is in the sidebar, but the app opens on ${start.label} (${start.to}): remove ${home.label} from nav.json`,
    ];
  }
  return [];
}
