// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { SearchInput, type SearchInputProps } from "./SearchInput";

function show(props: Partial<SearchInputProps> = {}) {
  const onChange = vi.fn<(value: string) => void>();
  renderWithProviders(<SearchInput value="" onChange={onChange} label="Search members" {...props} />);
  return { onChange, user: userEvent.setup(), input: screen.getByRole("searchbox", { name: "Search members" }) };
}

describe("SearchInput", () => {
  it("is a labelled search field showing its value and placeholder", () => {
    const { input } = show({ value: "ada", placeholder: "Find someone" });
    expect(input).toHaveValue("ada");
    expect(input).toHaveAttribute("placeholder", "Find someone");
  });

  it("reports what is typed", async () => {
    const { onChange, user, input } = show();
    await user.type(input, "a");
    expect(onChange).toHaveBeenCalledWith("a");
  });

  it("offers no clear button when there is no text", () => {
    show();
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears with the clear button", async () => {
    const { onChange, user } = show({ value: "ada" });
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("clears with Escape, and ignores other keys", async () => {
    const { onChange, user, input } = show({ value: "ada" });
    input.focus();
    await user.keyboard("{Enter}");
    expect(onChange).not.toHaveBeenCalled();
    await user.keyboard("{Escape}");
    expect(onChange).toHaveBeenCalledWith("");
  });

  it("is full width and medium sized by default", () => {
    const { input } = show();
    expect(getComputedStyle(input.parentElement as HTMLElement).width).toBe("100%");
    expect(getComputedStyle(input).height).toBe("40px");
  });

  it("takes a width and a size", () => {
    const { input } = show({ width: "50%", size: "sm" });
    expect(getComputedStyle(input.parentElement as HTMLElement).width).toBe("50%");
    expect(getComputedStyle(input).height).toBe("36px");
  });

  it("reports losing focus, and copes with no listener", async () => {
    const onBlur = vi.fn();
    const { user, input } = show({ onBlur });
    await user.click(input);
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("copes with losing focus when nothing listens", async () => {
    const { user, input } = show();
    await user.click(input);
    await user.tab();
    expect(input).not.toHaveFocus();
  });

  it("does not report the blur a press on the clear button causes, nor one after it", async () => {
    const onBlur = vi.fn();
    const onClear = vi.fn();
    const { user, input } = show({ value: "ada", onBlur, onClear });
    await user.click(input);
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    expect(onBlur).not.toHaveBeenCalled();
    expect(onClear).toHaveBeenCalledTimes(1);
    await user.click(input);
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });

  it("forgets a press on the clear button that never moved focus", async () => {
    const onBlur = vi.fn();
    const { user, input } = show({ value: "ada", onBlur });
    const clear = screen.getByRole("button", { name: "Clear search" });
    fireEvent.mouseDown(clear);
    fireEvent.click(clear);
    await user.click(input);
    await user.tab();
    expect(onBlur).toHaveBeenCalledTimes(1);
  });
});
