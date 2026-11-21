import { describe, expect, it } from "vitest";
import { USERS_READ, THEME_MANAGE } from "./../permissions.gen";
import { navItemsFor, openingRedirect } from "@jwcarman/roux-web/navigation";
import { nav } from "./nav";

describe("the app's navigation", () => {
  it("lists every page to someone who may see them all", () => {
    expect(navItemsFor(nav, [USERS_READ, THEME_MANAGE]).map((item) => item.label)).toEqual([
      "Home",
      "Users",
      "Appearance",
      "Settings",
    ]);
  });

  it("leaves out a page that needs a permission the caller lacks", () => {
    expect(navItemsFor(nav, []).map((item) => item.label)).toEqual(["Home", "Settings"]);
  });

  it("opens on Home", () => {
    expect(openingRedirect(nav, [USERS_READ], false)).toBeNull();
  });

  it("says where each page is and what it is for, opening on Home", () => {
    expect(
      navItemsFor(nav, [USERS_READ, THEME_MANAGE]).map(({ label, to, description, start }) => ({
        label,
        to,
        description,
        start,
      })),
    ).toEqual([
      { label: "Home", to: "/", description: "A welcome page.", start: true },
      { label: "Users", to: "/users", description: "Who can use the app and what they may do.", start: undefined },
      { label: "Appearance", to: "/appearance", description: "The app's colours, corners and font.", start: undefined },
      { label: "Settings", to: "/settings", description: "Your own account settings.", start: undefined },
    ]);
  });
});
