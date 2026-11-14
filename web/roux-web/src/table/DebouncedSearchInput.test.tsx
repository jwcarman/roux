// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { DebouncedSearchInput } from "./DebouncedSearchInput";

describe("DebouncedSearchInput", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  function show(minLength?: number) {
    const onSearchChange = vi.fn<(term: string | undefined) => void>();
    const view = renderWithProviders(
      <DebouncedSearchInput label="Search people" onSearchChange={onSearchChange} minLength={minLength} />,
    );
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    return { onSearchChange, user, view, input: screen.getByRole("searchbox", { name: "Search people" }) };
  }

  it("reports the trimmed term once typing pauses", async () => {
    const { onSearchChange, user, input } = show();
    await user.type(input, " ada ");
    expect(onSearchChange).not.toHaveBeenCalledWith("ada");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(onSearchChange).toHaveBeenLastCalledWith("ada");
  });

  it("reports nothing at first", () => {
    const { onSearchChange } = show();
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("asks for more characters below the minimum, and does not search", async () => {
    const { onSearchChange, user, input } = show(3);
    await user.type(input, "ad");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(screen.getByText("Type at least 3 characters to search")).toBeInTheDocument();
    expect(onSearchChange).not.toHaveBeenCalled();

    await user.type(input, "a");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenLastCalledWith("ada");
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
  });

  it("clears with the clear button, and reports the search gone", async () => {
    const { onSearchChange, user, input } = show();
    await user.type(input, "ada");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.click(screen.getByRole("button", { name: "Clear search" }));
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(input).toHaveValue("");
    expect(onSearchChange).toHaveBeenLastCalledWith(undefined);
    expect(screen.queryByRole("button", { name: "Clear search" })).toBeNull();
  });

  it("clears with Escape", async () => {
    const { user, input } = show();
    await user.type(input, "ada");
    await user.keyboard("{Escape}");
    expect(input).toHaveValue("");
  });

  it("does not report again when the parent renders with a new callback", async () => {
    const { onSearchChange, user, input, view } = show();
    await user.type(input, "ada");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    const next = vi.fn();
    view.rerender(<DebouncedSearchInput label="Search people" onSearchChange={next} />);
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(onSearchChange).toHaveBeenCalledTimes(1);
    expect(next).not.toHaveBeenCalled();
  });

  it("starts from the term it is given, without reporting it", () => {
    const onSearchChange = vi.fn();
    renderWithProviders(<DebouncedSearchInput label="Search people" term="ada" onSearchChange={onSearchChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveValue("ada");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("follows a term changed elsewhere, such as by Back, without reporting it", () => {
    const onSearchChange = vi.fn();
    const view = renderWithProviders(
      <DebouncedSearchInput label="Search people" term="ada" onSearchChange={onSearchChange} />,
    );
    view.rerender(<DebouncedSearchInput label="Search people" term="grace" onSearchChange={onSearchChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveValue("grace");
    view.rerender(<DebouncedSearchInput label="Search people" term={undefined} onSearchChange={onSearchChange} />);
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(screen.getByRole("searchbox", { name: "Search people" })).toHaveValue("");
    expect(onSearchChange).not.toHaveBeenCalled();
  });

  it("reports to the newest callback", async () => {
    const { user, input, view } = show();
    const next = vi.fn();
    view.rerender(<DebouncedSearchInput label="Search people" onSearchChange={next} />);
    await user.type(input, "ada");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    expect(next).toHaveBeenCalledWith("ada");
  });

  it("keeps what is typed when the term it reported comes back as the term in effect", async () => {
    const { user, input, view } = show();
    await user.type(input, " ada ");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    view.rerender(<DebouncedSearchInput label="Search people" term="ada" onSearchChange={vi.fn()} />);
    expect(input).toHaveValue(" ada ");
  });

  it("does not ask for more characters when nothing, or only blanks, is typed", async () => {
    const { user, input } = show(3);
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
    await user.type(input, "  ");
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
  });

  it("does not ask for more characters once the minimum is typed", async () => {
    const { user, input } = show(3);
    await user.type(input, "ada");
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
  });
});
