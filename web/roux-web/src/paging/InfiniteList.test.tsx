// @vitest-environment jsdom
import { onlineManager } from "@tanstack/react-query";
import { act, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { pageQuery, type PageDto, type PageQuery } from "./paging";
import { people, type Person } from "../testing/fakeServer";
import { pageOf } from "../testing/pages";
import { renderWithProviders } from "../testing/render";
import { InfiniteList, type InfiniteListProps } from "./InfiniteList";

const everyone = people(25);

type ShowProps = Partial<Omit<InfiniteListProps<Person>, "query">> & {
  /** What the list's query fetches with; ten people a page unless given. */
  fetchPage?: PageQuery<Person>["fetch"];
};

function show({ fetchPage: given, ...props }: ShowProps = {}) {
  const fetchPage = vi.fn<PageQuery<Person>["fetch"]>(
    given ?? (({ pageIndex = 0 }) => Promise.resolve(pageOf(everyone, { pageIndex, pageSize: 10 }))),
  );
  const view = renderWithProviders(
    <InfiniteList
      aria-label="People"
      query={pageQuery(["people", "infinite"], fetchPage)}
      getItemKey={(person) => person.id}
      renderItem={(person) => <span>{person.name}</span>}
      emptyText="Nobody here."
      errorText="Could not load the people."
      {...props}
    />,
  );
  return { fetchPage, user: userEvent.setup(), unmount: view.unmount };
}

function items(): string[] {
  return within(screen.getByRole("list", { name: "People" }))
    .getAllByRole("listitem")
    .map((item) => item.textContent ?? "");
}

/** What one IntersectionObserver was asked to do. */
interface Observation {
  callback: IntersectionObserverCallback;
  options: IntersectionObserverInit | undefined;
  observed: Element[];
  disconnected: boolean;
}

/** Records IntersectionObservers, so a test can scroll the sentinel into view. */
function observeIntersections() {
  const observations: Observation[] = [];
  vi.stubGlobal(
    "IntersectionObserver",
    class {
      private readonly observation: Observation;
      constructor(callback: IntersectionObserverCallback, options?: IntersectionObserverInit) {
        this.observation = { callback, options, observed: [], disconnected: false };
        observations.push(this.observation);
      }
      observe(element: Element): void {
        this.observation.observed.push(element);
      }
      unobserve(): void {}
      disconnect(): void {
        this.observation.disconnected = true;
      }
    },
  );
  const live = () => observations.filter((observation) => !observation.disconnected);
  const report = (entries: Partial<IntersectionObserverEntry>[]) =>
    act(() => {
      for (const observation of live()) {
        observation.callback(entries as IntersectionObserverEntry[], {} as IntersectionObserver);
      }
    });
  return {
    observations,
    live,
    scrollToEnd: () => report([{ isIntersecting: true }]),
    scrollAway: () => report([{ isIntersecting: false }]),
    reportNothing: () => report([]),
  };
}

/** The background a rule gives `element` while it is hovered, if any. */
function hoverBackground(element: Element): string | undefined {
  const rules = Array.from(document.querySelectorAll("style")).flatMap((style) => style.textContent?.split("}") ?? []);
  const own = element.className.split(" ").filter((name) => name.startsWith("css-"));
  const hover = rules.find((rule) => rule.includes(":hover") && own.some((name) => rule.includes(`.${name}:`)));
  return /(?:^|[{;])background:([^;]+)/.exec(hover ?? "")?.[1];
}

/** A page that stays pending until the test settles it. */
function deferred() {
  let settle: (page: PageDto<Person>) => void = () => undefined;
  let fail: (reason: Error) => void = () => undefined;
  const promise = new Promise<PageDto<Person>>((resolve, reject) => {
    settle = resolve;
    fail = reject;
  });
  return { promise, settle, fail };
}

describe("InfiniteList", () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    onlineManager.setOnline(true);
  });

  it("shows the first page as a list", async () => {
    show();
    await screen.findByText("Person 001");
    expect(items()).toHaveLength(10);
  });

  it("loads more on request, until there is no more", async () => {
    const { user, fetchPage } = show();
    await screen.findByText("Person 001");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Person 020");
    await user.click(screen.getByRole("button", { name: "Load more" }));
    await screen.findByText("Person 025");
    expect(items()).toHaveLength(25);
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    expect(fetchPage.mock.calls.map(([params]) => params)).toEqual([
      { pageIndex: 0 },
      { pageIndex: 1 },
      { pageIndex: 2 },
    ]);
  });

  it("loads more by itself when scrolled to the end, in auto mode", async () => {
    const { scrollToEnd } = observeIntersections();
    show({ loadMode: "auto" });
    await screen.findByText("Person 001");
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    scrollToEnd();
    expect(await screen.findByText("Person 020")).toBeInTheDocument();
  });

  it("offers the button too, in hybrid mode", async () => {
    const { scrollToEnd } = observeIntersections();
    show({ loadMode: "hybrid" });
    await screen.findByText("Person 001");
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
    scrollToEnd();
    expect(await screen.findByText("Person 020")).toBeInTheDocument();
  });

  it("falls back to the button where the browser cannot observe scrolling", async () => {
    vi.stubGlobal("IntersectionObserver", undefined);
    show({ loadMode: "auto" });
    await screen.findByText("Person 001");
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("fetches each page with the abort signal", async () => {
    const { fetchPage } = show();
    await screen.findByText("Person 001");
    expect(fetchPage.mock.calls[0][1]).toBeInstanceOf(AbortSignal);
  });

  it("keys the list by the query's key and \"infinite\", never a plain query's key", async () => {
    const view = renderWithProviders(
      <InfiniteList
        aria-label="People"
        query={pageQuery(["people", { status: "ACTIVE" }], ({ pageIndex = 0 }) =>
          Promise.resolve(pageOf(everyone, { pageIndex, pageSize: 10 })),
        )}
        getItemKey={(person) => person.id}
        renderItem={(person) => <span>{person.name}</span>}
      />,
    );
    await screen.findByText("Person 001");
    expect(
      view.client
        .getQueryCache()
        .getAll()
        .map((cached) => cached.queryKey),
    ).toEqual([["people", { status: "ACTIVE" }, "infinite"]]);
  });

  it("says when there is nothing to list", async () => {
    show({ fetchPage: () => Promise.resolve(pageOf<Person>([], { pageIndex: 0, pageSize: 10 })) });
    expect(await screen.findByText("Nobody here.")).toBeInTheDocument();
  });

  it("shows a spinner while the first page loads", async () => {
    show({ fetchPage: () => new Promise<PageDto<Person>>(() => undefined) });
    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
  });

  it("says when the list could not be loaded", async () => {
    show({ fetchPage: () => Promise.reject(new Error("down")) });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the people.");
  });

  it("says so in its own words when nothing is given for an empty or failed list", async () => {
    show({
      fetchPage: () => Promise.resolve(pageOf<Person>([], { pageIndex: 0, pageSize: 10 })),
      emptyText: undefined,
    });
    expect(await screen.findByText("Nothing to show.")).toBeInTheDocument();
  });

  it("says the list could not be loaded when no text is given", async () => {
    show({ fetchPage: () => Promise.reject(new Error("down")), errorText: undefined });
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the list.");
  });

  it("shows nothing while the browser is offline and no page has loaded", async () => {
    onlineManager.setOnline(false);
    show();
    expect(await screen.findByText("Nobody here.")).toBeInTheDocument();
  });

  it("does not observe scrolling in manual mode, the default", async () => {
    const { observations } = observeIntersections();
    show();
    await screen.findByText("Person 001");
    expect(observations).toHaveLength(0);
    expect(document.querySelector("div[style]")).toBeNull();
    expect(screen.getByRole("button", { name: "Load more" })).toBeInTheDocument();
  });

  it("observes a one-pixel sentinel, a threshold before the end, and stops when unmounted", async () => {
    const { live, observations } = observeIntersections();
    const { unmount } = show({ loadMode: "auto" });
    await screen.findByText("Person 001");
    expect(live()).toHaveLength(1);
    expect(live()[0]?.options).toEqual({ rootMargin: "100px" });
    const sentinel = live()[0]?.observed[0] as HTMLElement;
    expect(sentinel.style.height).toBe("1px");
    unmount();
    expect(observations.every((observation) => observation.disconnected)).toBe(true);
  });

  it("takes the margin from the threshold", async () => {
    const { live } = observeIntersections();
    show({ loadMode: "auto", threshold: 250 });
    await screen.findByText("Person 001");
    expect(live()[0]?.options).toEqual({ rootMargin: "250px" });
  });

  it("does not load more when the end is not in view, or nothing is reported", async () => {
    const { scrollAway, reportNothing } = observeIntersections();
    const { fetchPage } = show({ loadMode: "auto" });
    await screen.findByText("Person 001");
    scrollAway();
    reportNothing();
    expect(fetchPage).toHaveBeenCalledTimes(1);
  });

  it("does not ask for a page while one is on its way", async () => {
    const { scrollToEnd } = observeIntersections();
    const second = deferred();
    const fetchPage = vi.fn<PageQuery<Person>["fetch"]>(({ pageIndex }) =>
      pageIndex === 0 ? Promise.resolve(pageOf(everyone, { pageIndex, pageSize: 10 })) : second.promise,
    );
    show({ loadMode: "auto", fetchPage });
    await screen.findByText("Person 001");
    scrollToEnd();
    expect(await screen.findByRole("status", { name: "Loading more" })).toBeInTheDocument();
    scrollToEnd();
    expect(fetchPage).toHaveBeenCalledTimes(2);
    act(() => second.settle(pageOf(everyone, { pageIndex: 1, pageSize: 10 })));
    await screen.findByText("Person 020");
    expect(screen.queryByRole("status", { name: "Loading more" })).toBeNull();
  });

  it("keeps no sentinel once everything has loaded", async () => {
    const { scrollToEnd, live } = observeIntersections();
    show({ loadMode: "auto" });
    await screen.findByText("Person 001");
    scrollToEnd();
    await screen.findByText("Person 020");
    scrollToEnd();
    await screen.findByText("Person 025");
    expect(live()).toHaveLength(0);
    expect(document.querySelector("div[style]")).toBeNull();
  });

  it("shows a spinner only while more is loading", async () => {
    const second = deferred();
    const { user } = show({
      fetchPage: ({ pageIndex }) =>
        pageIndex === 0 ? Promise.resolve(pageOf(everyone, { pageIndex, pageSize: 10 })) : second.promise,
    });
    await screen.findByText("Person 001");
    expect(screen.queryByRole("status", { name: "Loading more" })).toBeNull();
    await user.click(screen.getByRole("button", { name: "Load more" }));
    expect(await screen.findByRole("status", { name: "Loading more" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Load more" })).toBeNull();
    act(() => second.settle(pageOf(everyone, { pageIndex: 1, pageSize: 10 })));
    await screen.findByText("Person 020");
    expect(screen.queryByRole("status", { name: "Loading more" })).toBeNull();
  });

  it("draws a border round the first item and none above the rest", async () => {
    show();
    await screen.findByText("Person 001");
    const [first, second] = screen.getAllByRole("listitem");
    expect(getComputedStyle(first).borderTopWidth).toBe("1px");
    expect(getComputedStyle(second).borderTopWidth).toBe("0px");
  });

  it("highlights the item under the pointer", async () => {
    show();
    await screen.findByText("Person 001");
    expect(hoverBackground(screen.getAllByRole("listitem")[0])).toBe("var(--chakra-colors-bg-muted)");
  });
});
