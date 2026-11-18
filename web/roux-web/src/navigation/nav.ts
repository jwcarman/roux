import type { LinkProps } from "@tanstack/react-router";
import type { IconType } from "react-icons";

/**
 * Where an item goes: a path the app's router knows. In an app, TanStack Router's registered route
 * tree makes this the union of its paths, so a misspelt or removed route is a type error.
 */
export type NavTo = LinkProps["to"];

/** A page in the navigation. */
export interface NavEntry<Permission extends string> {
  /** The link's text, and its accessible name when only the icon shows. */
  label: string;
  to: NavTo;
  /** The item's icon, a component (`LuUsers` from react-icons): an icon that does not exist does not compile. */
  icon: IconType;
  /** The permission the page needs; the item is hidden from callers without it. One of the app's declared permissions. */
  permission?: Permission;
  /** What the page is for, in one sentence an owner would understand. */
  description: string;
  /** Whether the app opens on this page; at most one place has it. */
  start?: boolean;
}

/** The app's navigation, made by {@link defineNav}. */
export interface Nav<Permission extends string> {
  /** Every permission the app knows. */
  readonly permissions: readonly Permission[];
  /** The places, in the order they are shown. */
  readonly items: readonly NavEntry<Permission>[];
}

/** The permissions of the person who is signed in, as their session reports them. */
export type Permissions = readonly string[];

/**
 * Declares the app's navigation. `permissions` is every permission the app knows (the strings its
 * roles grant); an item's `permission` must be one of them, which TypeScript checks, and which this
 * checks again when the module loads, so a permission that was renamed on the server fails at once
 * instead of hiding a page from everyone. It also refuses what makes the navigation ambiguous: two
 * items for one place or with one label, two start places, and a Home item (`/`) beside a start
 * place that is elsewhere (the app opens on the start place, so Home would be unreachable).
 *
 * @throws Error naming the item and what is wrong
 */
export function defineNav<const Permission extends string>(
  permissions: readonly Permission[],
  items: readonly NavEntry<NoInfer<Permission>>[],
): Nav<Permission> {
  const problems: string[] = [];
  const seenTo = new Set<string>();
  const seenLabel = new Set<string>();
  for (const item of items) {
    if (item.permission !== undefined && !permissions.includes(item.permission)) {
      problems.push(
        `${item.label} needs the permission "${item.permission}", which is not one of the app's permissions`,
      );
    }
    if (seenTo.has(item.to as string)) {
      problems.push(`${item.label} (${item.to as string}) is a second item for the same place`);
    }
    if (seenLabel.has(item.label)) {
      problems.push(`${item.label} is the label of two items`);
    }
    seenTo.add(item.to as string);
    seenLabel.add(item.label);
  }
  const starts = items.filter((item) => item.start === true);
  if (starts.length > 1) {
    problems.push(`${starts.map((item) => item.label).join(" and ")} are both the start place: only one may be`);
  }
  const home = items.find((item) => item.to === "/");
  if (starts.length === 1 && home !== undefined && starts[0].to !== "/") {
    problems.push(
      `${home.label} (/) is in the navigation, but the app opens on ${starts[0].label} (${starts[0].to as string}): remove ${home.label}`,
    );
  }
  if (problems.length > 0) {
    throw new Error(`The navigation is wrong: ${problems.join("; ")}`);
  }
  return { permissions, items };
}

/** The items a caller with `permissions` may open: none when signed out (`undefined` or `null`). */
export function navItemsFor<Permission extends string>(
  nav: Nav<Permission>,
  permissions: Permissions | null | undefined,
): NavEntry<Permission>[] {
  if (!permissions) {
    return [];
  }
  return nav.items.filter((item) => item.permission === undefined || permissions.includes(item.permission));
}

/**
 * Where `/` sends a caller with `permissions`: the start place, when it is not `/` and they may open
 * it; otherwise `null`, and `/` shows Home. A start place they may not open never redirects, so a
 * guard that sends people to `/` cannot loop.
 */
export function startPathFor<Permission extends string>(
  nav: Nav<Permission>,
  permissions: Permissions | null | undefined,
): NavTo | null {
  const start = navItemsFor(nav, permissions).find((item) => item.start === true);
  return start !== undefined && start.to !== "/" ? start.to : null;
}

/**
 * Where opening `/` sends a caller: the start place, unless `home` says a guard sent them to Home
 * (so a start place that refuses them cannot loop); `null` shows Home.
 */
export function openingRedirect<Permission extends string>(
  nav: Nav<Permission>,
  permissions: Permissions | null | undefined,
  home: boolean,
): NavTo | null {
  return home ? null : startPathFor(nav, permissions);
}
