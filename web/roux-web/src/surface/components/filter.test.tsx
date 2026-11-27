// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { rulesFor } from "../../testing/css";
import { renderSurface } from "../testSurface";

const components = [
  { id: "root", component: "Column", children: ["when"] },
  {
    id: "when",
    component: "FilterChips",
    label: "When",
    value: { "@path": "/args/when" },
    options: [
      { value: "today", label: "Today" },
      { value: "week", label: "This week" },
      { value: "all", label: "All" },
    ],
  },
];

const pressed = () => screen.getAllByRole("button").filter((b) => b.getAttribute("aria-pressed") === "true");

describe("FilterChips", () => {
  it("shows a labelled group with a chip per option, and the bound value's chip pressed", () => {
    renderSurface(components, { args: { when: "week" } });
    const group = screen.getByRole("group", { name: "When" });
    expect(group.querySelectorAll("button")).toHaveLength(3);
    expect(pressed().map((b) => b.textContent)).toEqual(["This week"]);
  });

  it("shows its label above the chips, as a field's label, and the chips as tall as an input", () => {
    renderSurface(components, { args: { when: "week" } });
    const group = screen.getByRole("group", { name: "When" });
    const label = screen.getByText("When");
    expect(label.compareDocumentPosition(group) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(label).toHaveAttribute("aria-hidden", "true");
    expect(rulesFor(label)).toMatch(/font-weight:\s*var\(--chakra-font-weights-medium\)/);
    expect(rulesFor(label)).toMatch(/font-size:\s*var\(--chakra-font-sizes-sm\)/);
    expect(rulesFor(group.parentElement as HTMLElement)).toMatch(/min-height:\s*var\(--chakra-sizes-10\)/);
    expect(rulesFor(group.parentElement as HTMLElement)).toMatch(/align-items:\s*center/);
    expect(rulesFor(label.parentElement as HTMLElement)).toMatch(/gap:\s*var\(--chakra-spacing-1\\\.5\)/);
  });

  it("choosing a chip writes its value to the path, and presses it", async () => {
    const surface = renderSurface(components, { args: { when: "week" } });
    await userEvent.click(screen.getByRole("button", { name: "Today" }));
    expect(surface.read("/args/when")).toBe("today");
    expect(pressed().map((b) => b.textContent)).toEqual(["Today"]);
  });

  it("a focused chip is chosen with Space", async () => {
    const surface = renderSurface(components, { args: { when: "week" } });
    await userEvent.tab();
    await userEvent.keyboard(" ");
    expect(surface.read("/args/when")).toBe("today");
  });

  it("a value that matches no option presses none, and does not throw", () => {
    renderSurface(components, { args: { when: "someday" } });
    expect(pressed()).toHaveLength(0);
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("an unset path presses no chip, even one whose value is empty", () => {
    const withEmpty = components.map((c) =>
      c.id === "when" ? { ...c, options: [{ value: "", label: "Blank" }, ...(c.options ?? [])] } : c,
    );
    renderSurface(withEmpty, {});
    expect(pressed()).toHaveLength(0);
  });
});
