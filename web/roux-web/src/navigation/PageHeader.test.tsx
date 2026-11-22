// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { rulesFor } from "../testing/css";
import { renderWithProviders } from "../testing/render";
import { PageHeader } from "./PageHeader";

describe("PageHeader", () => {
  it("titles the page, with its actions beside the title", () => {
    renderWithProviders(
      <PageHeader title="Users">
        <Button>Invite user</Button>
      </PageHeader>,
    );

    const title = screen.getByRole("heading", { level: 2, name: "Users" });
    const invite = screen.getByRole("button", { name: "Invite user" });
    expect(title.parentElement).toBe(invite.parentElement);
  });

  it("stands as tall as a button with or without one, so every page's title sits in one place", () => {
    renderWithProviders(<PageHeader title="Settings" />);

    const header = screen.getByRole("heading", { level: 2, name: "Settings" }).parentElement!;
    expect(rulesFor(header)).toMatch(/min-height:\s*var\(--chakra-sizes-10\)/);
    expect(rulesFor(header)).toMatch(/align-items:\s*center/);
    expect(rulesFor(header)).toMatch(/justify-content:\s*space-between/);
  });
});
