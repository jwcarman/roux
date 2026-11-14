// @vitest-environment jsdom
import { onlineManager } from "@tanstack/react-query";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { PageDto } from "./paging";
import { fakeEndpoint, people, type Person } from "../testing/fakeServer";
import { renderWithProviders } from "../testing/render";
import { InfiniteSelect, type InfiniteSelectProps, type InfiniteSelectQuery } from "./InfiniteSelect";

const everyone = people(45);

/** A page that stays pending until the test settles it. */
function deferred() {
  let settle: (page: PageDto<Person>) => void = () => undefined;
  const promise = new Promise<PageDto<Person>>((resolve) => {
    settle = resolve;
  });
  return { promise, settle };
}
const endpoint = fakeEndpoint(everyone);

describe("InfiniteSelect", () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
  });

  afterEach(() => {
    vi.useRealTimers();
    onlineManager.setOnline(true);
  });

  function show(props: Partial<InfiniteSelectProps<Person>> = {}) {
    const queryFn = vi.fn((params: InfiniteSelectQuery) =>
      endpoint({ search: params.search, pageIndex: params.pageIndex, pageSize: params.pageSize }),
    );
    const onChange = vi.fn<(id: string | undefined) => void>();
    const element = (value: string | undefined) => (
      <InfiniteSelect
        label="Owner"
        value={value}
        onChange={onChange}
        queryKey={["people", "select"]}
        queryFn={queryFn}
        getItemId={(person) => person.id}
        getItemLabel={(person) => person.name}
        getItemSubtext={(person) => person.email}
        placeholder="Choose a person"
        {...props}
      />
    );
    const view = renderWithProviders(element(props.value));
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    return { queryFn, onChange, user, rerender: (value: string | undefined) => view.rerender(element(value)) };
  }

  function input() {
    return screen.getByRole("combobox", { name: "Owner" });
  }

  async function typeAndPause(user: ReturnType<typeof userEvent.setup>, text: string) {
    await user.type(input(), text);
    act(() => {
      vi.advanceTimersByTime(300);
    });
  }

  it("is a labelled combobox that fetches nothing until opened", () => {
    const { queryFn } = show();
    expect(input()).toHaveAttribute("placeholder", "Choose a person");
    expect(queryFn).not.toHaveBeenCalled();
  });

  it("lists the first page when opened", async () => {
    const { user, queryFn } = show();
    await user.click(input());
    expect(await screen.findByRole("option", { name: /Person 001/ })).toBeInTheDocument();
    expect(screen.getAllByRole("option")).toHaveLength(20);
    expect(queryFn).toHaveBeenLastCalledWith({ search: undefined, pageIndex: 0, pageSize: 20 });
  });

  it("chooses with the arrow keys and Enter, starting from the first option", async () => {
    const { user, onChange } = show();
    await user.click(input());
    const first = await screen.findByRole("option", { name: /Person 001/ });
    await waitFor(() => expect(first).toHaveAttribute("data-highlighted"));
    await user.keyboard("{ArrowDown}");
    await waitFor(() => expect(screen.getByRole("option", { name: /Person 002/ })).toHaveAttribute("data-highlighted"));
    await user.keyboard("{Enter}");
    expect(onChange).toHaveBeenLastCalledWith("p2");
  });

  it("shows the item its value names, and nothing until the parent agrees", async () => {
    const { user, rerender } = show();
    await user.click(input());
    await user.click(await screen.findByRole("option", { name: /Person 002/ }));
    rerender("p2");
    await waitFor(() => expect(input()).toHaveValue("Person 002"));
    rerender(undefined);
    await waitFor(() => expect(input()).toHaveValue(""));
  });

  it("names a value given before anything loads, from initialItem", () => {
    show({ value: "p7", initialItem: everyone[6] });
    expect(input()).toHaveValue("Person 007");
  });

  it("searches what is typed once typing pauses, and not the chosen item's label", async () => {
    const { user, queryFn } = show();
    await user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    await typeAndPause(user, "person 04");
    expect(await screen.findByRole("option", { name: /Person 045/ })).toBeInTheDocument();
    expect(screen.queryByRole("option", { name: /Person 001/ })).toBeNull();
    expect(queryFn).toHaveBeenLastCalledWith({ search: "person 04", pageIndex: 0, pageSize: 20 });

    await user.click(screen.getByRole("option", { name: /Person 045/ }));
    act(() => {
      vi.advanceTimersByTime(300);
    });

    // Reopened, the list is everyone again, not just the item whose label now fills the input.
    await user.click(screen.getByRole("button", { name: "Toggle suggestions" }));
    expect(await screen.findByRole("option", { name: /Person 001/ })).toBeInTheDocument();
    expect(queryFn.mock.calls.some(([query]) => query.search === "Person 045")).toBe(false);
  });

  it("does not fetch for a term below the minimum", async () => {
    const { user, queryFn } = show({ minSearchLength: 3 });
    await user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    await typeAndPause(user, "pe");
    expect(await screen.findByText("Type at least 3 characters to search")).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(1);
  });

  it("loads the next page when scrolled to the end", async () => {
    const { user } = show();
    await user.click(input());
    await screen.findByRole("option", { name: /Person 020/ });
    fireEvent.scroll(screen.getByRole("listbox"));
    expect(await screen.findByRole("option", { name: /Person 021/ })).toBeInTheDocument();
  });

  it("says when nothing matches", async () => {
    const { user } = show({ queryFn: () => endpoint({ search: "nobody" }) });
    await user.click(input());
    expect(await screen.findByText("No items found")).toBeInTheDocument();
  });

  it("clears an optional choice", async () => {
    const { user, onChange } = show({ value: "p7", initialItem: everyone[6] });
    await user.click(screen.getByRole("button", { name: "Clear value" }));
    expect(onChange).toHaveBeenLastCalledWith(undefined);
  });

  it("offers no clear button when a choice is required", () => {
    show({ value: "p7", initialItem: everyone[6], required: true });
    expect(screen.queryByRole("button", { name: "Clear value" })).toBeNull();
  });

  it("caps the page size at what a Paginator returns", async () => {
    const { user, queryFn } = show({ pageSize: 500 });
    await user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    expect(queryFn.mock.calls[0][0].pageSize).toBe(100);
  });

  it("says when the options could not be loaded", async () => {
    const { user } = show({ queryFn: () => Promise.reject<PageDto<Person>>(new Error("down")) });
    await user.click(input());
    // Ark also renders an empty live region with role="alert" for its own announcements.
    const message = await screen.findByText("Could not load the options.");
    expect(message.closest("[role=alert]")).not.toBeNull();
  });

  /** Gives the listbox the geometry of a scrolled list, which jsdom does not lay out. */
  function scrollTo(listbox: HTMLElement, geometry: { scrollHeight: number; scrollTop: number; clientHeight: number }) {
    for (const [name, value] of Object.entries(geometry)) {
      Object.defineProperty(listbox, name, { configurable: true, value });
    }
    fireEvent.scroll(listbox);
  }

  async function opened(props: Partial<InfiniteSelectProps<Person>> = {}) {
    const shown = show(props);
    await shown.user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    return { ...shown, listbox: screen.getByRole("listbox") };
  }

  it("is not invalid unless told", () => {
    show();
    expect(input()).not.toHaveAttribute("aria-invalid");
  });

  it("is invalid when told", () => {
    show({ invalid: true });
    expect(input()).toHaveAttribute("aria-invalid", "true");
  });

  it("has no choice to clear when it has no value", () => {
    show();
    expect(screen.queryByRole("button", { name: "Clear value" })).toBeNull();
  });

  it("lists nothing while the browser is offline and no page has loaded", async () => {
    onlineManager.setOnline(false);
    const { user } = show();
    await user.click(input());
    expect(await screen.findByText("No items found")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("names the chosen item even when the listed page does not hold it", async () => {
    const { user } = show({ value: "p41", initialItem: everyone[40] });
    await user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    expect(input()).toHaveValue("Person 041");
  });

  it("keeps naming an item chosen from a search once the list is everyone again", async () => {
    const { user, rerender } = show();
    await user.click(input());
    await screen.findByRole("option", { name: /Person 001/ });
    await typeAndPause(user, "person 04");
    await user.click(await screen.findByRole("option", { name: /Person 045/ }));
    rerender("p45");
    act(() => {
      vi.advanceTimersByTime(300);
    });
    await user.click(screen.getByRole("button", { name: "Toggle suggestions" }));
    await screen.findByRole("option", { name: /Person 001/ });
    expect(screen.queryByRole("option", { name: /Person 045/ })).toBeNull();
    expect(input()).toHaveValue("Person 045");
  });

  it("shows the subtext of each item only when it has one", async () => {
    await opened();
    expect(screen.getByText(everyone[0]?.email ?? "")).toBeInTheDocument();
  });

  it("shows no subtext when there is no way to get one", async () => {
    await opened({ getItemSubtext: undefined });
    expect(screen.queryByText(everyone[0]?.email ?? "")).toBeNull();
  });

  it("does not ask for more characters when nothing, or only blanks, is typed", async () => {
    const { user } = await opened({ minSearchLength: 3 });
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
    await typeAndPause(user, "  ");
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
  });

  it("does not ask for more characters once the minimum is typed", async () => {
    const { user } = await opened({ minSearchLength: 3 });
    await typeAndPause(user, "per");
    await screen.findByRole("option", { name: /Person 001/ });
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
    await typeAndPause(user, "s");
    await screen.findByRole("option", { name: /Person 001/ });
    expect(screen.queryByText("Type at least 3 characters to search")).toBeNull();
  });

  it("lists each item once, so the arrow keys wrap from the first to the last", async () => {
    const { user } = show({ value: "p1", initialItem: everyone[0] });
    await user.click(input());
    await screen.findByRole("option", { name: /Person 020/ });
    const first = screen.getByRole("option", { name: /Person 001/ });
    await waitFor(() => expect(first).toHaveAttribute("data-highlighted"));
    await user.keyboard("{ArrowUp}");
    await waitFor(() => expect(screen.getByRole("option", { name: /Person 020/ })).toHaveAttribute("data-highlighted"));
  });

  it("loads the next page only when the end is near", async () => {
    const { queryFn, listbox } = await opened();
    scrollTo(listbox, { scrollHeight: 1000, scrollTop: 0, clientHeight: 300 });
    scrollTo(listbox, { scrollHeight: 1000, scrollTop: 650, clientHeight: 300 });
    expect(queryFn).toHaveBeenCalledTimes(1);
    scrollTo(listbox, { scrollHeight: 1000, scrollTop: 651, clientHeight: 300 });
    expect(await screen.findByRole("option", { name: /Person 021/ })).toBeInTheDocument();
    expect(queryFn).toHaveBeenCalledTimes(2);
  });

  it("does not load a page while one is on its way", async () => {
    const second = deferred();
    const queryFn = vi.fn((query: InfiniteSelectQuery) =>
      query.pageIndex === 1 ? second.promise : endpoint({ ...query }),
    );
    const { listbox } = await opened({ queryFn });
    scrollTo(listbox, { scrollHeight: 100, scrollTop: 0, clientHeight: 100 });
    expect(await screen.findByRole("status", { name: "Loading more" })).toBeInTheDocument();
    scrollTo(listbox, { scrollHeight: 100, scrollTop: 0, clientHeight: 100 });
    expect(queryFn).toHaveBeenCalledTimes(2);
    act(() => second.settle(endpoint({ pageIndex: 1, pageSize: 20 }) as never));
    await screen.findByRole("option", { name: /Person 021/ });
    expect(screen.queryByRole("status", { name: "Loading more" })).toBeNull();
  });

  it("does not load a page after the last", async () => {
    const queryFn = vi.fn((query: InfiniteSelectQuery) => endpoint({ ...query }));
    const { listbox } = await opened({ queryFn });
    const near = { scrollHeight: 100, scrollTop: 0, clientHeight: 100 };
    scrollTo(listbox, near);
    await screen.findByRole("option", { name: /Person 021/ });
    scrollTo(listbox, near);
    await screen.findByRole("option", { name: /Person 041/ });
    expect(queryFn).toHaveBeenCalledTimes(3);
    scrollTo(listbox, near);
    expect(queryFn).toHaveBeenCalledTimes(3);
  });

  it("keeps the options out of sight when a later page could not be loaded", async () => {
    const { listbox } = await opened({
      queryFn: (query) => (query.pageIndex === 0 ? endpoint({ ...query }) : Promise.reject(new Error("down"))),
    });
    scrollTo(listbox, { scrollHeight: 100, scrollTop: 0, clientHeight: 100 });
    expect(await screen.findByText("Could not load the options.")).toBeInTheDocument();
    expect(screen.queryAllByRole("option")).toHaveLength(0);
  });

  it("is as wide as the field it opens from", async () => {
    await opened();
    const positioner = screen.getByRole("listbox").parentElement as HTMLElement;
    expect(positioner.style.width).toBe("var(--reference-width)");
  });
});
