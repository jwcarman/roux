// @vitest-environment jsdom
import { Button, ButtonGroup, ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { ReactElement } from "react";
import { FilterChips } from "./FilterChips";

/**
 * The chips under Chakra's own theme alone: these tests check the chip recipe, and the app theme's global
 * colours (which jsdom cannot compute) would stay in the document for every later test.
 */
function renderStyled(ui: ReactElement) {
  return render(<ChakraProvider value={defaultSystem}>{ui}</ChakraProvider>);
}

const ROLES = [
  { value: "OWNER", label: "Owners" },
  { value: "MEMBER", label: "Members" },
] as const;

describe("FilterChips", () => {
  it("is a labelled group whose chosen chip is pressed", () => {
    renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} allLabel="All" />);
    const group = screen.getByRole("group", { name: "Role" });
    expect(group).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Owners" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers All for no filter, pressed when nothing is chosen", () => {
    renderStyled(<FilterChips label="Role" options={ROLES} value={undefined} onChange={vi.fn()} allLabel="All" />);
    expect(screen.getByRole("button", { name: "All" })).toHaveAttribute("aria-pressed", "true");
  });

  it("reports the chip chosen, and undefined for All", async () => {
    const onChange = vi.fn();
    renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={onChange} allLabel="All" />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Members" }));
    expect(onChange).toHaveBeenLastCalledWith("MEMBER");
    await user.click(screen.getByRole("button", { name: "All" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("offers no All chip unless asked", () => {
    renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />);
    expect(screen.queryByRole("button", { name: "All" })).toBeNull();
    expect(screen.getByRole("button", { name: "Owners" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Members" })).toBeInTheDocument();
  });

  it("is not a joined button group", () => {
    renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />);
    expect(getComputedStyle(screen.getByRole("button", { name: "Owners" })).borderStartEndRadius).not.toBe("0px");
  });

  it("fills the chosen chip and outlines the others", () => {
    renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />);
    const chosen = getComputedStyle(screen.getByRole("button", { name: "Owners" }));
    const other = getComputedStyle(screen.getByRole("button", { name: "Members" }));
    expect(chosen.backgroundColor).not.toBe(other.backgroundColor);
    expect(other.backgroundColor).toBe("rgba(0, 0, 0, 0)");
  });

  it("outlines the other chips, as an outline button is", () => {
    renderStyled(
      <>
        <FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />
        <Button variant="outline">Reference</Button>
      </>,
    );
    const other = getComputedStyle(screen.getByRole("button", { name: "Members" }));
    const outline = getComputedStyle(screen.getByRole("button", { name: "Reference" }));
    expect(other.borderColor).toBe(outline.borderColor);
    expect(other.borderColor).not.toBe(getComputedStyle(screen.getByRole("button", { name: "Owners" })).borderColor);
  });

  it("fills the chosen chip even inside a toolbar that outlines its buttons", () => {
    renderStyled(
      <ButtonGroup variant="outline">
        <FilterChips label="Role" options={ROLES} value="OWNER" onChange={vi.fn()} />
      </ButtonGroup>,
    );
    const chosen = getComputedStyle(screen.getByRole("button", { name: "Owners" }));
    const other = getComputedStyle(screen.getByRole("button", { name: "Members" }));
    expect(chosen.backgroundColor).not.toBe(other.backgroundColor);
  });

  describe("with a default value", () => {
    it("shows the default chip chosen while the URL has no value", () => {
      renderStyled(
        <FilterChips label="Role" options={ROLES} value={undefined} defaultValue="MEMBER" onChange={vi.fn()} />,
      );
      expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Owners" })).toHaveAttribute("aria-pressed", "false");
    });

    it("shows the value chosen when the URL has one", () => {
      renderStyled(<FilterChips label="Role" options={ROLES} value="OWNER" defaultValue="MEMBER" onChange={vi.fn()} />);
      expect(screen.getByRole("button", { name: "Owners" })).toHaveAttribute("aria-pressed", "true");
      expect(screen.getByRole("button", { name: "Members" })).toHaveAttribute("aria-pressed", "false");
    });

    it("reports undefined for the default chip and the value for any other", async () => {
      const onChange = vi.fn();
      renderStyled(
        <FilterChips label="Role" options={ROLES} value="OWNER" defaultValue="MEMBER" onChange={onChange} />,
      );
      const user = userEvent.setup();
      await user.click(screen.getByRole("button", { name: "Members" }));
      expect(onChange).toHaveBeenLastCalledWith(undefined);
      await user.click(screen.getByRole("button", { name: "Owners" }));
      expect(onChange).toHaveBeenLastCalledWith("OWNER");
    });

    it("cannot also offer an All chip", () => {
      const both = (
        // @ts-expect-error a default and an "All" chip are two answers to "nothing chosen"
        <FilterChips
          label="Role"
          options={ROLES}
          value={undefined}
          defaultValue="MEMBER"
          allLabel="All"
          onChange={vi.fn()}
        />
      );
      expect(both).toBeDefined();
    });

    it("only takes one of the options' values as its default", () => {
      const unknown = (
        <FilterChips
          label="Role"
          options={ROLES}
          value={undefined}
          // @ts-expect-error "VISITOR" is not one of the chips
          defaultValue="VISITOR"
          onChange={vi.fn()}
        />
      );
      expect(unknown).toBeDefined();
    });
  });
});
