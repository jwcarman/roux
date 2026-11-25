import { describe, expect, it } from "vitest";
import { ITEMS_READ, USERS_READ, THEME_MANAGE } from "./../permissions.gen";
import { navItemsFor, openingRedirect } from "@jwcarman/roux-web/navigation";
import { nav } from "./nav";

describe("the app's navigation", () => {
  it("lists every page to someone who may see them all", () => {
    expect(
      navItemsFor(nav, [ITEMS_READ, USERS_READ, THEME_MANAGE]).map(
        (item) => item.label,
      ),
    ).toEqual(["Home", "Items", "Users", "Appearance"]);
  });

  it("leaves out a page that needs a permission the caller lacks", () => {
    expect(navItemsFor(nav, []).map((item) => item.label)).toEqual(["Home"]);
  });

  it("opens on Home", () => {
    expect(openingRedirect(nav, [USERS_READ], {})).toBeNull();
  });

  it("says where each page is and what it is for, opening on Home", () => {
    expect(
      navItemsFor(nav, [ITEMS_READ, USERS_READ, THEME_MANAGE]).map(
        ({ label, to, description, start }) => ({
          label,
          to,
          description,
          start,
        }),
      ),
    ).toEqual([
      { label: "Home", to: "/", description: "A welcome page.", start: true },
      {
        label: "Items",
        to: "/items",
        description:
          "The team's plans: what is happening, when, and who has it.",
        start: undefined,
      },
      {
        label: "Users",
        to: "/users",
        description: "Who can use the app and what they may do.",
        start: undefined,
      },
      {
        label: "Appearance",
        to: "/appearance",
        description: "The app's colours, corners and font.",
        start: undefined,
      },
    ]);
  });
});
