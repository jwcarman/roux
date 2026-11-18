// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { LuHouse, LuUsers } from "react-icons/lu";
import { rulesFor } from "../testing/css";
import { renderInRouter } from "../testing/router";
import { defineNav } from "./nav";
import { NavLinks, RAIL_LABELS } from "./NavLinks";

const PERMISSIONS = ["members.read", "ranks.read"] as const;
const nav = defineNav(PERMISSIONS, [
  { label: "Home", to: "/", icon: LuHouse, description: "A welcome page." },
  { label: "Members", to: "/members", icon: LuUsers, permission: "members.read", description: "Who can use the app." },
  { label: "Ranks", to: "/ranks", icon: LuUsers, permission: "ranks.read", description: "The belts." },
]);

async function show(
  permissions: readonly string[],
  path = "/",
  props: { compact?: boolean; onNavigate?: () => void } = {},
) {
  const view = renderInRouter(<NavLinks nav={nav} permissions={permissions} {...props} />, path);
  const main = await screen.findByRole("navigation", { name: "Main" });
  return { ...view, main };
}

describe("NavLinks", () => {
  it("draws one link for each item the person may open, with its icon, label and place", async () => {
    const { main } = await show(["members.read"]);

    const links = within(main).getAllByRole("link");
    expect(
      links.map((link) => [link.getAttribute("aria-label"), link.getAttribute("href"), link.getAttribute("title")]),
    ).toEqual([
      ["Home", "/", "Home"],
      ["Members", "/members", "Members"],
    ]);
    for (const link of links) {
      expect(link.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
      expect(link).toHaveTextContent(link.getAttribute("aria-label") ?? "");
    }
  });

  it("draws nothing for a person who may open nothing but what needs no permission", async () => {
    const { main } = await show([]);

    expect(within(main).getAllByRole("link")).toHaveLength(1);
  });

  it("marks the current page, and Home only on exactly /", async () => {
    const onMembers = await show(["members.read"], "/members");

    expect(within(onMembers.main).getByRole("link", { name: "Members" })).toHaveAttribute("aria-current", "page");
    expect(within(onMembers.main).getByRole("link", { name: "Home" })).not.toHaveAttribute("aria-current");
  });

  it("marks Home on /", async () => {
    const { main } = await show(["members.read"], "/");

    expect(within(main).getByRole("link", { name: "Home" })).toHaveAttribute("aria-current", "page");
    expect(within(main).getByRole("link", { name: "Members" })).not.toHaveAttribute("aria-current");
  });

  it("goes to the page, and says so", async () => {
    const onNavigate = vi.fn();
    const { main, router } = await show(["members.read"], "/", { onNavigate });

    await userEvent.click(within(main).getByRole("link", { name: "Members" }));

    expect(await screen.findByRole("heading", { name: "Members page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/members");
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("can be followed without anyone listening", async () => {
    const { main } = await show(["members.read"]);

    await userEvent.click(within(main).getByRole("link", { name: "Members" }));

    expect(await screen.findByRole("heading", { name: "Members page" })).toBeInTheDocument();
  });

  it("marks the current page with the palette's subtle color and a heavier weight", async () => {
    const { main } = await show(["members.read"], "/members");

    const rules = rulesFor(within(main).getByRole("link", { name: "Members" }));
    expect(rules).toContain("[aria-current=page]");
    expect(rules).toMatch(/\[aria-current=page\]\{background:var\(--chakra-colors-color-palette-subtle\)/);
    expect(rules).toContain("font-weight:var(--chakra-font-weights-semibold)");
  });

  it("is the full sidebar by default: labels always shown, links start-aligned", async () => {
    const { main } = await show(["members.read"]);
    const button = within(main).getByRole("link", { name: "Members" });

    expect(rulesFor(within(main).getByText("Members", { selector: "span" }))).not.toContain("display:none");
    expect(rulesFor(button)).toContain("justify-content:start");
    expect(rulesFor(button)).not.toMatch(/min-width: 48rem\)[^}]*justify-content:center/);
  });

  it("is the icon rail when compact: labels hidden below lg, links centered from md and start-aligned from lg", async () => {
    const { main } = await show(["members.read"], "/", { compact: true });
    const button = within(main).getByRole("link", { name: "Members" });

    expect(RAIL_LABELS).toEqual({ hideBelow: "lg" });
    expect(rulesFor(within(main).getByText("Members", { selector: "span" }))).toMatch(
      /max-width: 63\.9975rem\)[^}]*display:none/,
    );
    expect(rulesFor(button)).toMatch(/min-width: 48rem\)[^}]*justify-content:center/);
    expect(rulesFor(button)).toMatch(/min-width: 64rem\)[^}]*justify-content:start/);
  });
});
