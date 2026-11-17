import { describe, expect, it } from "vitest";
import { MEMBERS_READ, THEME_MANAGE, type Me } from "../api";
import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { LuInbox } from "react-icons/lu";
import { ICONS, NAV_ITEMS, type NavItem, navItemsFor, openingRedirect, placeProblems, startPathFor } from "./nav";
import navJson from "./nav.json";
import { routeTree } from "../routeTree.gen";

describe("navItemsFor", () => {
  it("lists every page to someone who may see them all", () => {
    const owner: Me = { identityId: "o", permissions: [MEMBERS_READ, THEME_MANAGE] };
    expect(navItemsFor(owner).map((item) => item.label)).toEqual(["Home", "Members", "Appearance", "Settings"]);
  });

  it("leaves out a page that needs a permission the caller lacks", () => {
    const customer: Me = { identityId: "c", permissions: [] };
    expect(navItemsFor(customer).map((item) => item.label)).toEqual(["Home", "Settings"]);
  });

  it("lists nothing to a signed-out visitor", () => {
    expect(navItemsFor(null)).toEqual([]);
  });

  it("names each page once, so the label works as its link's accessible name", () => {
    const labels = NAV_ITEMS.map((item) => item.label);
    expect(new Set(labels).size).toBe(labels.length);
  });

});

describe("nav.json", () => {
  const places: Record<string, unknown>[] = navJson;

  it("names a known icon for every place", () => {
    for (const item of navJson) {
      expect(ICONS, item.icon).toHaveProperty(item.icon);
    }
  });

  it("links every place to a page that exists", () => {
    const router = createRouter({ routeTree, context: { queryClient: new QueryClient(), session: undefined! } });
    const paths = Object.keys(router.routesByPath);
    for (const item of navJson) {
      expect(paths, item.to).toContain(item.to);
    }
  });

  it("marks exactly one place as where the app opens", () => {
    expect(places.filter((item) => item.start === true)).toHaveLength(1);
  });

  it("describes every place in one sentence", () => {
    for (const item of navJson) {
      expect(item.description, item.label).toMatch(/^[^.!?]+[.!?]$/);
    }
  });

  it("uses only the known keys", () => {
    const known = ["label", "to", "icon", "permission", "description", "start"];
    for (const item of places) {
      expect(Object.keys(item).filter((key) => !known.includes(key))).toEqual([]);
    }
  });
});

describe("startPathFor", () => {
  const owner: Me = { identityId: "o", permissions: [] };
  const home: NavItem = { ...NAV_ITEMS[0], start: false };
  const inbox: NavItem = { label: "Inbox", to: "/settings", icon: LuInbox, description: "x.", start: true };

  it("sends / to the start place", () => {
    expect(startPathFor(owner, [home, inbox])).toBe("/settings");
  });

  it("stays on / when / is the start place", () => {
    expect(startPathFor(owner)).toBeNull();
  });

  it("stays on / when the caller may not see the start place", () => {
    const locked: NavItem = { ...inbox, permission: "x.y" };
    expect(startPathFor({ identityId: "c", permissions: [] }, [home, locked])).toBeNull();
  });

  it("stays on / for a signed-out visitor", () => {
    expect(startPathFor(null, [home, inbox])).toBeNull();
  });
});

describe("openingRedirect", () => {
  const owner: Me = { identityId: "o", permissions: [] };
  const home: NavItem = { ...NAV_ITEMS[0], start: false };
  const inbox: NavItem = { label: "Inbox", to: "/settings", icon: LuInbox, description: "x.", start: true };

  it("goes to the start place when the app is opened", () => {
    expect(openingRedirect(owner, false, [home, inbox])).toBe("/settings");
  });

  it("shows Home when a guard sent the caller there", () => {
    expect(openingRedirect(owner, true, [home, inbox])).toBeNull();
  });
});

describe("placeProblems", () => {
  const entry = { icon: "house", description: "x." };

  it("finds none in nav.json", () => {
    expect(placeProblems(navJson)).toEqual([]);
  });

  it("flags Home left in the sidebar when the app opens elsewhere", () => {
    const places = [
      { ...entry, label: "Home", to: "/" },
      { ...entry, label: "Inbox", to: "/inbox", start: true },
    ];
    expect(placeProblems(places)).toEqual([
      'Home (/) is in the sidebar, but the app opens on Inbox (/inbox): remove Home from nav.json',
    ]);
  });
});
