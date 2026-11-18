import { describe, expect, it } from "vitest";
import { LuHouse } from "react-icons/lu";
import { defineNav } from "./nav";
import "../testing/router";

/*
 * Type tests: the lines with @ts-expect-error must NOT compile (`npm run typecheck` fails if one
 * does). They run nothing.
 */
describe("the navigation's types", () => {
  it("checks the route, the permission and the icon", () => {
    expect(checks).toBeTypeOf("function");
  });
});

function checks() {
  const permissions = ["members.read"] as const;
  const entry = { label: "Members", icon: LuHouse, description: "." };

  defineNav(permissions, [{ ...entry, to: "/" }]);
  defineNav(permissions, [{ ...entry, to: "/members", permission: "members.read" }]);

  // @ts-expect-error a route the router does not know
  defineNav(permissions, [{ ...entry, to: "/nowhere" }]);
  // @ts-expect-error a permission the app does not declare
  defineNav(permissions, [{ ...entry, to: "/members", permission: "members.raed" }]);
  // @ts-expect-error an icon is a component, not a name
  defineNav(permissions, [{ ...entry, to: "/", icon: "house" }]);
}
