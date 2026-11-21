// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { ColorModeButton, ColorModeProvider } from "./colorMode";
import { renderWithProviders } from "@jwcarman/roux-web/testing";

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
