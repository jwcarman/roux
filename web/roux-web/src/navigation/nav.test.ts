import { describe, expect, it } from "vitest";
import { LuHouse, LuUsers } from "react-icons/lu";
import { defineNav, navItemsFor, openingRedirect, startPathFor, type NavEntry } from "./nav";

const PERMISSIONS = ["members.read", "ranks.read"] as const;

type Item = NavEntry<(typeof PERMISSIONS)[number]>;

const home: Item = { label: "Home", to: "/", icon: LuHouse, description: "A welcome page." };
const members: Item = {
  label: "Members",
  to: "/members",
  icon: LuUsers,
  permission: "members.read",
  description: "Who can use the app.",
};
const ranks: Item = {
  label: "Ranks",
  to: "/ranks",
  icon: LuUsers,
  permission: "ranks.read",
  description: "The belts.",
};

describe("defineNav", () => {
  it("gives back the permissions and the items, in order", () => {
    const nav = defineNav(PERMISSIONS, [home, members, ranks]);

    expect(nav.permissions).toBe(PERMISSIONS);
    expect(nav.items).toEqual([home, members, ranks]);
  });

  it("accepts a start place with Home beside it only when the start place is Home", () => {
    expect(() => defineNav(PERMISSIONS, [{ ...home, start: true }, members])).not.toThrow();
  });

  it("refuses a permission the app does not know, naming the item", () => {
    const typo = { ...members, permission: "members.raed" } as unknown as Item;

    expect(() => defineNav(PERMISSIONS, [typo])).toThrow(
      'Members needs the permission "members.raed", which is not one of the app\'s permissions',
    );
  });

  it("refuses two items for one place", () => {
    expect(() => defineNav(PERMISSIONS, [members, { ...members, label: "People" }])).toThrow(
      "People (/members) is a second item for the same place",
    );
  });

  it("refuses two items with one label", () => {
    expect(() => defineNav(PERMISSIONS, [members, { ...ranks, label: "Members" }])).toThrow(
      "Members is the label of two items",
    );
  });

  it("refuses two start places", () => {
    expect(() =>
      defineNav(PERMISSIONS, [
        { ...members, start: true },
        { ...ranks, start: true },
      ]),
    ).toThrow("Members and Ranks are both the start place: only one may be");
  });

  it("refuses Home beside a start place elsewhere, which would leave Home unreachable", () => {
    expect(() => defineNav(PERMISSIONS, [home, { ...members, start: true }])).toThrow(
      "Home (/) is in the navigation, but the app opens on Members (/members): remove Home",
    );
  });

  it("allows Home when nothing is the start place", () => {
    expect(() => defineNav(PERMISSIONS, [home, members])).not.toThrow();
  });

  it("lists every problem at once", () => {
    const typo = { ...members, permission: "nope" } as unknown as Item;

    expect(() => defineNav(PERMISSIONS, [typo, { ...ranks, label: "Members" }])).toThrow(
      /^The navigation is wrong: Members needs the permission "nope".*; Members is the label of two items$/,
    );
  });
});

describe("navItemsFor", () => {
  const nav = defineNav(PERMISSIONS, [home, members, ranks]);

  it("is empty when signed out", () => {
    expect(navItemsFor(nav, null)).toEqual([]);
    expect(navItemsFor(nav, undefined)).toEqual([]);
  });

  it("keeps the items that need no permission, and the ones the caller holds", () => {
    expect(navItemsFor(nav, [])).toEqual([home]);
    expect(navItemsFor(nav, ["ranks.read"])).toEqual([home, ranks]);
    expect(navItemsFor(nav, ["ranks.read", "members.read", "other"])).toEqual([home, members, ranks]);
  });
});

describe("where the app opens", () => {
  const nav = defineNav(PERMISSIONS, [{ ...members, start: true }, ranks]);

  it("is the start place when the caller may open it", () => {
    expect(startPathFor(nav, ["members.read"])).toBe("/members");
  });

  it("is Home (null) when the caller may not open the start place, so nothing loops", () => {
    expect(startPathFor(nav, ["ranks.read"])).toBeNull();
    expect(startPathFor(nav, null)).toBeNull();
  });

  it("is Home (null) when the start place is Home itself, or there is none", () => {
    expect(startPathFor(defineNav(PERMISSIONS, [{ ...home, start: true }, members]), ["members.read"])).toBeNull();
    expect(startPathFor(defineNav(PERMISSIONS, [home, members]), ["members.read"])).toBeNull();
  });

  it("does not redirect a caller a guard just sent to Home", () => {
    expect(openingRedirect(nav, ["members.read"], false)).toBe("/members");
    expect(openingRedirect(nav, ["members.read"], true)).toBeNull();
  });
});
