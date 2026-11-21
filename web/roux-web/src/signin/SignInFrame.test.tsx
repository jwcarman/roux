// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rulesFor } from "../testing/css";
import { renderWithProviders } from "../testing/render";
import { SignInFrame } from "./SignInFrame";

function frame() {
  renderWithProviders(
    <SignInFrame tools={<button type="button">Dark mode</button>}>
      <p>The card's contents</p>
    </SignInFrame>,
  );
  const card = screen.getByText("The card's contents").parentElement!;
  return { page: screen.getByRole("main"), card };
}

describe("SignInFrame", () => {
  it("puts the card's contents in the page's main landmark, with the tools beside it", () => {
    const { page } = frame();

    expect(page).toContainElement(screen.getByText("The card's contents"));
    expect(screen.getByRole("button", { name: "Dark mode" })).not.toBeNull();
    expect(page).not.toContainElement(screen.getByRole("button", { name: "Dark mode" }));
  });

  it("centres a card no wider than 400px", () => {
    const { page, card } = frame();

    expect(rulesFor(page)).toMatch(/align-items:\s*center/);
    expect(rulesFor(page)).toMatch(/justify-content:\s*center/);
    expect(rulesFor(card)).toMatch(/max-width:\s*400px/);
    expect(rulesFor(card)).toMatch(/width:\s*100%/);
  });

  it("draws the card on a tinted page from a small screen up, and lets it be the page on a phone", () => {
    const { page, card } = frame();
    const small = (rules: string) => rules.split("@media").filter((rule) => rule.includes("min-width: 30rem"));

    expect(rulesFor(page)).toMatch(/background:\s*var\(--chakra-colors-bg\)/);
    expect(small(rulesFor(page)).join()).toMatch(/background:\s*var\(--chakra-colors-bg-subtle\)/);
    const phone = rulesFor(card).split("@media")[0];
    expect(phone).toMatch(/border-width:\s*0;/);
    expect(phone).toMatch(/box-shadow:\s*none;/);
    expect(phone).toMatch(/padding:\s*var\(--chakra-spacing-2\)/);
    expect(phone).toMatch(/border-radius:\s*var\(--chakra-radii-none\)/);
    expect(rulesFor(page).split("@media")[0]).toMatch(/padding-block:\s*var\(--chakra-spacing-16\)/);
    expect(small(rulesFor(page)).join()).toMatch(/padding-block:\s*var\(--chakra-spacing-8\)/);
    expect(rulesFor(page).split("@media")[0]).toMatch(/align-items:\s*flex-start/);
    expect(small(rulesFor(card)).join()).toMatch(/border-width:\s*1px/);
    expect(small(rulesFor(card)).join()).toMatch(/border-radius:\s*var\(--chakra-radii-l3\)/);
    expect(small(rulesFor(card)).join()).toMatch(/box-shadow:\s*var\(--chakra-shadows-sm\)/);
    expect(small(rulesFor(card)).join()).toMatch(/padding:\s*var\(--chakra-spacing-8\)/);
  });
});
