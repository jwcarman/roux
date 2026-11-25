// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { LuLogOut, LuMoon, LuSettings } from "react-icons/lu";
import { describe, expect, it, vi } from "vitest";
import { rulesFor } from "../testing/css";
import { renderInRouter } from "../testing/router";
import { AccountMenu, AccountMenuItem, AccountMenuLink, AccountMenuSeparator, AccountMenuSwitch } from "./AccountMenu";

function DarkMode() {
  const [dark, setDark] = useState(false);
  return (
    <AccountMenuSwitch icon={LuMoon} checked={dark} onCheckedChange={setDark}>
      Dark mode
    </AccountMenuSwitch>
  );
}

interface Shown {
  person?: { name?: string; email?: string };
  compact?: boolean;
  onNavigate?: () => void;
  signOut?: () => void;
}

function menu({
  person = { name: "Ada Lovelace", email: "ada@example.org" },
  compact = true,
  onNavigate = () => {},
  signOut = () => {},
}: Shown = {}) {
  return renderInRouter(
    <AccountMenu name={person.name} email={person.email} compact={compact}>
      <AccountMenuLink to="/settings" icon={LuSettings} onNavigate={onNavigate}>
        Settings
      </AccountMenuLink>
      <DarkMode />
      <AccountMenuSeparator />
      <AccountMenuItem icon={LuLogOut} onSelect={signOut}>
        Sign out
      </AccountMenuItem>
    </AccountMenu>,
  );
}

async function open() {
  await userEvent.click(await screen.findByRole("button", { name: "Account" }));
  return screen.findByRole("menu");
}

describe("AccountMenu", () => {
  it("shows who is signed in on one button: initials, name and email, with the menu shut", async () => {
    menu();

    const button = await screen.findByRole("button", { name: "Account" });
    expect(button).toHaveTextContent("AL");
    expect(within(button).getByText("Ada Lovelace")).toBeInTheDocument();
    expect(within(button).getByText("ada@example.org")).toBeInTheDocument();
    expect(button).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("menu")).not.toBeInTheDocument();
  });

  it("still offers the menu before the name has loaded", async () => {
    menu({ person: {} });

    const button = await screen.findByRole("button", { name: "Account" });
    expect(button).not.toHaveTextContent("Ada");
    expect(await open()).toBeInTheDocument();
  });

  it("opens a menu of the items it was given", async () => {
    menu();

    const opened = await open();

    expect(within(opened).getByRole("menuitem", { name: "Settings" })).toBeInTheDocument();
    expect(within(opened).getByRole("menuitemcheckbox", { name: "Dark mode" })).toBeInTheDocument();
    expect(within(opened).getByRole("separator")).toBeInTheDocument();
    expect(within(opened).getByRole("menuitem", { name: "Sign out" })).toBeInTheDocument();
  });

  it("opens above the button, fixed so the sidebar and the drawer do not clip it", async () => {
    menu();

    const opened = await open();

    await vi.waitFor(() => expect(opened).toHaveAttribute("data-placement", "top-start"));
    expect(opened.parentElement).toHaveStyle({ position: "fixed" });
  });

  it("follows a link item, and says so to close the drawer", async () => {
    const onNavigate = vi.fn();
    const { router } = menu({ onNavigate });

    await userEvent.click(within(await open()).getByRole("menuitem", { name: "Settings" }));

    expect(await screen.findByRole("heading", { name: "Settings page" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/settings");
    expect(onNavigate).toHaveBeenCalledOnce();
  });

  it("runs an item's action and shuts the menu", async () => {
    const signOut = vi.fn();
    menu({ signOut });

    await userEvent.click(within(await open()).getByRole("menuitem", { name: "Sign out" }));

    expect(signOut).toHaveBeenCalledOnce();
    await vi.waitFor(() =>
      expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-expanded", "false"),
    );
  });

  it("flips a switch item in place, leaving the menu open", async () => {
    menu();
    const opened = await open();
    const dark = within(opened).getByRole("menuitemcheckbox", { name: "Dark mode" });
    expect(dark).toHaveAttribute("aria-checked", "false");

    // Lined up with the other items: no room kept for a check mark, as the switch shows the state.
    expect(rulesFor(dark)).toMatch(/padding-inline-start:\s*var\(--chakra-spacing-2\)/);

    await userEvent.click(dark);

    expect(screen.getByRole("button", { name: "Account" })).toHaveAttribute("aria-expanded", "true");
    expect(within(screen.getByRole("menu")).getByRole("menuitemcheckbox", { name: "Dark mode" })).toHaveAttribute(
      "aria-checked",
      "true",
    );
  });

  it("is only the initials in the icon rail, and whole in the drawer", async () => {
    const rail = menu();
    const name = (await screen.findByText("Ada Lovelace")).parentElement!;
    expect(rulesFor(name)).toMatch(/max-width: 63\.9975rem\)[^}]*display:none/);
    rail.unmount();

    menu({ compact: false });
    expect(rulesFor((await screen.findByText("Ada Lovelace")).parentElement!)).not.toMatch(/display:none/);
  });
});
