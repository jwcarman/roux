// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { FilterChips } from "./FilterChips";

const ROLES = [
  { value: "OWNER", label: "Owners" },
  { value: "MEMBER", label: "Members" },
] as const;

describe("FilterChips", () => {
  it("is a labelled group whose chosen chip is pressed", () => {
    renderWithProviders(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} allLabel="All" />);
    const group = screen.getByRole("group", { name: "Role" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Owners" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers All for no filter, pressed when nothing is chosen", () => {
    renderWithProviders(
      <FilterChips label="Role" options={ROLES} value={undefined} onChange={vi.fn()} allLabel="All" />,
    );
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the chip chosen, and undefined for All", async () => {
    const onChange = vi.fn();
    renderWithProviders(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={onChange} allLabel="All" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Members" }));
    expect(onChange).toHaveBeenLastCalledWith("MEMBER");
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("offers no All chip unless asked", () => {
    renderWithProviders(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
  });
});
