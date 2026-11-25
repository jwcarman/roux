// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AccountMenu } from "../navigation";
import { renderWithProviders } from "../testing";
import { renderInRouter } from "../testing/router";
import { ColorModeButton, ColorModeProvider, ColorModeSwitch } from "./colorMode";

describe("ColorModeProvider", () => {
  afterEach(() => vi.restoreAllMocks());

  it("renders next-themes' script as an inert data block, so React has no script to warn about", () => {
    const error = vi.spyOn(console, "error");
    const { container } = renderWithProviders(
      <ColorModeProvider>
        <p>app</p>
      </ColorModeProvider>,
    );
    const scripts = container.querySelectorAll("script");
    expect(scripts.length).toBeGreaterThan(0);
    for (const script of scripts) {
      expect(script).toHaveAttribute("type", "application/json");
    }
    expect(error).not.toHaveBeenCalledWith(expect.stringContaining("Encountered a script tag"));
  });
});

describe("ColorModeButton", () => {
  it("switches between light and dark, starting from the system's mode", async () => {
    window.localStorage.clear();
    renderWithProviders(
      <ColorModeProvider>
        <ColorModeButton />
      </ColorModeProvider>,
    );
    const user = userEvent.setup();

    await user.click(await screen.findByRole("button", { name: "Switch to dark mode" }));
    expect(document.documentElement).toHaveClass("dark");

    await user.click(screen.getByRole("button", { name: "Switch to light mode" }));
    expect(document.documentElement).toHaveClass("light");
    expect(document.documentElement).not.toHaveClass("dark");
  });
});

describe("ColorModeSwitch", () => {
  it("is on in dark mode, and turns it on and off from the account menu", async () => {
    window.localStorage.clear();
    renderInRouter(
      <ColorModeProvider>
        <AccountMenu name="Ada Lovelace" email="ada@example.org" compact>
          <ColorModeSwitch />
        </AccountMenu>
      </ColorModeProvider>,
    );
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Account" }));
    const dark = await screen.findByRole("menuitemcheckbox", { name: "Dark mode" });
    expect(dark).not.toBeChecked();

    await user.click(dark);
    expect(document.documentElement).toHaveClass("dark");
    expect(await screen.findByRole("menuitemcheckbox", { name: "Dark mode" })).toBeChecked();

    await user.click(screen.getByRole("menuitemcheckbox", { name: "Dark mode" }));
    expect(document.documentElement).toHaveClass("light");
  });
});
