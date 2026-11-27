// @vitest-environment jsdom
import { DataModel } from "@a2ui/web_core";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { onSessionLost } from "../api/client";
import type { SurfaceJson } from "../a2ui";
import { AppShell } from "../navigation/AppShell";
import { defineNav } from "../navigation/nav";
import { rulesFor } from "../testing/css";
import { Toaster, toaster } from "../feedback/toaster";
import { invalidFields, serverError, stale } from "../testing/problems";
import { pageOf } from "../testing/pages";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { surfaces, type Binding } from "./bind";
import type { Pagination } from "./values";
import { Surface } from "./Surface";
import { contract, type Commands, type ItemRow, type Queries } from "./testdata/items.contract";

const at = (path: string) => ({ "@path": path });

const items: SurfaceJson = {
  id: "items",
  components: [
    { id: "root", component: "Column", children: ["open", "filters", "table", "addForm", "supplier", "period"] },
    { id: "open", component: "Stat", label: "Open", value: at("/counts/open") },
    { id: "filters", component: "Form", children: ["search", "status"] },
    { id: "search", component: "InputField", label: "Search", value: at("/itemsArgs/search") },
    {
      id: "status",
      component: "SelectField",
      label: "Status",
      value: at("/itemsArgs/status"),
      options: [
        { value: "open", label: "Open" },
        { value: "done", label: "Done" },
      ],
    },
    {
      id: "table",
      component: "DataTable",
      rows: at("/items"),
      pageIndex: at("/itemsArgs/pageIndex"),
      sortBy: at("/itemsArgs/sortBy"),
      sortDirection: at("/itemsArgs/sortDirection"),
      columns: [{ header: "Title", field: "title", sort: "TITLE" }],
    },
    { id: "addForm", component: "Form", children: ["draftTitle", "draftDay", "add"] },
    {
      id: "draftTitle",
      component: "InputField",
      label: "Title",
      value: at("/draft/title"),
      serverError: at("/errors/title"),
    },
    { id: "draftDay", component: "InputField", label: "Day", value: at("/draft/day"), serverError: at("/errors/day") },
    {
      id: "add",
      component: "Button",
      label: "Add item",
      action: { event: { name: "addItem", context: { title: at("/draft/title"), day: at("/draft/day") } } },
    },
    { id: "supplier", component: "Button", label: "Save supplier", action: { event: { name: "saveSupplier" } } },
    { id: "period", component: "Text", text: at("/errors/period/from") },
  ],
};

// What surfaceTypes would generate for the surface above.
interface ItemsData {
  counts: { open: number };
  itemsArgs: { search: string; status: string; pageIndex: number; sortBy: string; sortDirection: string };
  items: { data: { title: string | null }[]; pagination: Pagination };
  draft: { title: string; day: string };
  errors: { title: string; day: string; period: { from: string } };
}
interface ItemsEvents {
  addItem: { title: string; day: string };
  saveSupplier: Record<string, never>;
}

// The binder is made in each test, not once for the file: a mutant of surfaces() must reach every test.
const bind: ReturnType<typeof surfaces<Queries, Commands>>["bind"] = (spec) =>
  surfaces<Queries, Commands>(contract).bind(spec);

const emptyDraft = { title: "", day: "" };
const noErrors = { title: "", day: "", period: { from: "" } };

function itemsBinding(options: { errors?: boolean; draft?: { title: string; day: string } } = {}): Binding {
  return bind<ItemsData, ItemsEvents>(({ d, query, local, command, none }) => ({
    data: {
      counts: query("counts"),
      items: query("items", {
        status: d.itemsArgs.status,
        search: d.itemsArgs.search,
        pageIndex: d.itemsArgs.pageIndex,
        sortBy: d.itemsArgs.sortBy,
        sortDirection: d.itemsArgs.sortDirection,
        pageSize: 2,
      }),
      itemsArgs: local({ search: "", status: "open", pageIndex: 0, sortBy: "TITLE", sortDirection: "ASC" }),
      draft: local(options.draft ?? emptyDraft),
      errors: local(noErrors),
    },
    events: {
      addItem: command("addItem", (item) => ({ title: item.title, day: item.day }), {
        errors: options.errors === false ? undefined : d.errors,
        onSuccess: [{ set: d.itemsArgs.pageIndex, value: 0 }, { reset: d.draft }, { toast: "Item added" }],
      }),
      saveSupplier: none(),
    },
  }));
}

const row = (title: string, status = "open"): ItemRow => ({
  id: title,
  day: "2026-11-26",
  at: null,
  title,
  assigneeNames: [],
  status,
});
const rows = [row("Apples"), row("Bread"), row("Cheese"), row("Dates"), row("Eggs")];

/** A gate a handler waits at until the test opens it. */
function gate() {
  let open = () => undefined as void;
  const opened = new Promise<void>((resolve) => {
    open = resolve;
  });
  return { opened, open: () => act(() => open()) };
}

/** Answers items over `rows` and counts, recording each items request's params. */
function answerQueries(options: { open?: () => number } = {}) {
  const asked: URLSearchParams[] = [];
  server.use(
    http.get("/api/queries/items", ({ request }) => {
      const params = new URL(request.url).searchParams;
      asked.push(params);
      const matching = rows.filter((r) => r.status === (params.get("status") ?? "open"));
      return HttpResponse.json(
        pageOf(matching, { pageIndex: Number(params.get("pageIndex")), pageSize: Number(params.get("pageSize")) }),
      );
    }),
    http.get("/api/queries/counts", () => HttpResponse.json({ open: options.open?.() ?? 5, overdue: 0, today: 0 })),
  );
  return asked;
}

function renderItems(binding = itemsBinding()) {
  return renderWithProviders(
    <>
      <Surface surface={items} binding={binding} />
      <Toaster />
    </>,
  );
}

describe("Surface", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=t";
  });

  afterEach(() => act(() => toaster.remove()));

  it("rendersTheSurfaceWithItsLocalValues", async () => {
    answerQueries();
    renderItems(itemsBinding({ draft: { title: "Milk", day: "2026-11-27" } }));
    expect(await screen.findByLabelText("Title")).toHaveValue("Milk");
    expect(screen.getByLabelText("Day")).toHaveValue("2026-11-27");
    expect(screen.getByLabelText("Status")).toHaveValue("open");
  });

  it("asksItsAppShellForTheWideColumn", async () => {
    answerQueries();
    renderWithProviders(
      <AppShell nav={defineNav([] as const, [])} permissions={[]} appName="App">
        <Surface surface={items} binding={itemsBinding()} />
      </AppShell>,
    );
    await screen.findByLabelText("Title");
    expect(rulesFor(screen.getByRole("main"))).toContain("max-width:var(--chakra-sizes-6xl)");
  });

  it("fillsAPathFromItsQuery", async () => {
    answerQueries({ open: () => 7 });
    renderItems();
    expect(await screen.findByText("Apples")).toBeInTheDocument();
    expect(screen.getByText("Bread")).toBeInTheDocument();
    expect(screen.getByText("7")).toBeInTheDocument();
  });

  it("refetchesWhenAnArgPathChanges", async () => {
    const asked = answerQueries();
    renderItems();
    await screen.findByText("Apples");
    expect(asked.at(-1)?.toString()).toBe("status=open&search=&pageIndex=0&sortBy=TITLE&sortDirection=ASC&pageSize=2");

    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");

    await waitFor(() => expect(asked.at(-1)?.get("status")).toBe("done"));
    expect(await screen.findByText("Nothing yet")).toBeInTheDocument();
  });

  it("aFilterChangeResetsThePageIndex", async () => {
    const asked = answerQueries();
    renderItems();
    await screen.findByText("Apples");
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(await screen.findByText("Cheese")).toBeInTheDocument();
    await userEvent.click(screen.getByLabelText("Next page"));
    expect(await screen.findByText("Eggs")).toBeInTheDocument();
    expect(asked.at(-1)?.get("pageIndex")).toBe("2");

    await userEvent.type(screen.getByLabelText("Search"), "a");

    await waitFor(() => expect(asked.at(-1)?.get("search")).toBe("a"));
    expect(asked.at(-1)?.get("pageIndex")).toBe("0");
    expect(asked.some((params) => params.get("search") === "a" && params.get("pageIndex") === "2")).toBe(false);
    expect(await screen.findByText("Apples")).toBeInTheDocument();
  });

  it("aChangeToThePageIndexAloneKeepsIt", async () => {
    const asked = answerQueries();
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(await screen.findByText("Cheese")).toBeInTheDocument();
    expect(asked.at(-1)?.get("pageIndex")).toBe("1");
  });

  it("aWrittenPageIndexStaysWhenAFilterChanges", async () => {
    const asked = answerQueries();
    const binding = bind<ItemsData, ItemsEvents>(({ d, query, local, command, none }) => ({
      data: {
        counts: query("counts"),
        items: query("items", { status: d.itemsArgs.status, pageIndex: 1, pageSize: 2 }),
        itemsArgs: local({ search: "", status: "open", pageIndex: 0, sortBy: "", sortDirection: "" }),
        draft: local(emptyDraft),
        errors: local(noErrors),
      },
      events: { addItem: command("addItem", (item) => item), saveSupplier: none() },
    }));
    renderItems(binding);
    expect(await screen.findByText("Cheese")).toBeInTheDocument();

    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");

    await waitFor(() => expect(asked.at(-1)?.get("status")).toBe("done"));
    expect(asked.at(-1)?.get("pageIndex")).toBe("1");
  });

  it("showsASkeletonUntilTheFirstAnswer", async () => {
    const answer = gate();
    answerQueries();
    server.use(
      http.get("/api/queries/items", async () => {
        await answer.opened;
        return HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 2 }));
      }),
    );
    const { client } = renderItems();

    expect(await screen.findByRole("status", { name: "Loading" })).toBeInTheDocument();
    // The counts are in, but the items are not: still loading.
    await waitFor(() => expect(client.getQueryData(["queries", "counts", {}])).toBeDefined());
    expect(screen.getByRole("status", { name: "Loading" })).toBeInTheDocument();
    expect(screen.queryByLabelText("Title")).not.toBeInTheDocument();

    answer.open();

    expect(await screen.findByText("Apples")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
  });

  it("keepsThePreviousPageWhileTheNextLoads", async () => {
    const next = gate();
    answerQueries();
    server.use(
      http.get("/api/queries/items", async ({ request }) => {
        const pageIndex = Number(new URL(request.url).searchParams.get("pageIndex"));
        if (pageIndex > 0) await next.opened;
        return HttpResponse.json(pageOf(rows, { pageIndex, pageSize: 2 }));
      }),
    );
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByLabelText("Next page"));

    expect(screen.getByText("Apples")).toBeInTheDocument();
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();
    next.open();
    expect(await screen.findByText("Cheese")).toBeInTheDocument();
  });

  it("showsAnInlineErrorWithRetry", async () => {
    let calls = 0;
    let counts = 0;
    answerQueries({ open: () => ++counts });
    server.use(
      http.get("/api/queries/items", () =>
        ++calls === 1 ? serverError() : HttpResponse.json(pageOf(rows, { pageIndex: 0, pageSize: 2 })),
      ),
    );
    renderItems();

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not load this");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(screen.queryByRole("status", { name: "Loading" })).not.toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Retry" }));

    expect(await screen.findByText("Apples")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    // Retry asks again only for what failed.
    expect(counts).toBe(1);
  });

  it("aLaterFailureKeepsWhatItShowsBesideTheError", async () => {
    answerQueries();
    renderItems();
    await screen.findByText("Apples");
    server.use(http.get("/api/queries/items", () => serverError()));

    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load this");
    expect(screen.getByText("Apples")).toBeInTheDocument();
  });

  it("runsTheCommandWithAnIdempotencyKeyHeader", async () => {
    answerQueries();
    const sent: Request[] = [];
    server.use(
      http.post("/api/commands/addItem", ({ request }) => {
        sent.push(request.clone());
        return HttpResponse.json({ result: { id: "i1" }, events: [] });
      }),
    );
    renderItems(itemsBinding({ draft: { title: "Milk", day: "2026-11-27" } }));
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(sent).toHaveLength(1));
    expect(new URL(sent[0].url).search).toBe("");
    expect(sent[0].headers.get("Idempotency-Key")).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/,
    );
    expect(sent[0].headers.get("X-XSRF-TOKEN")).toBe("t");
    await expect(sent[0].json()).resolves.toEqual({ title: "Milk", day: "2026-11-27" });
  });

  it("aDoubleClickRunsOneCommand", async () => {
    answerQueries();
    const answer = gate();
    let commands = 0;
    server.use(
      http.post("/api/commands/addItem", async () => {
        commands++;
        await answer.opened;
        return HttpResponse.json({ result: { id: "i1" }, events: [] });
      }),
    );
    renderItems(itemsBinding({ draft: { title: "Milk", day: "2026-11-27" } }));
    await screen.findByText("Apples");
    const add = screen.getByRole("button", { name: "Add item" });

    await userEvent.dblClick(add);
    await waitFor(() => expect(commands).toBe(1));
    answer.open();

    expect(await screen.findByText("Item added")).toBeInTheDocument();
    expect(commands).toBe(1);
  });

  it("aRetryReusesTheKey", async () => {
    answerQueries();
    const keys: (string | null)[] = [];
    server.use(
      http.post("/api/commands/addItem", ({ request }) => {
        keys.push(request.headers.get("Idempotency-Key"));
        return keys.length === 1 ? serverError() : HttpResponse.json({ result: { id: "i1" }, events: [] });
      }),
    );
    renderItems(itemsBinding({ draft: { title: "Milk", day: "2026-11-27" } }));
    await screen.findByText("Apples");
    const add = screen.getByRole("button", { name: "Add item" });

    await userEvent.click(add);
    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    await userEvent.click(add);
    expect(await screen.findByText("Item added")).toBeInTheDocument();
    await userEvent.click(add);
    await waitFor(() => expect(keys).toHaveLength(3));

    expect(keys[1]).toBe(keys[0]);
    expect(keys[2]).not.toBe(keys[1]);
  });

  it("refetchesTheQueriesThatDependOnTheEvents", async () => {
    let open = 5;
    const asked = answerQueries({ open: () => open });
    server.use(
      http.post("/api/commands/addItem", () => {
        open = 6;
        return HttpResponse.json({ result: { id: "i1" }, events: ["ItemAdded"] });
      }),
    );
    renderItems(itemsBinding({ draft: { title: "", day: "2026-11-26" } }));
    await screen.findByText("Apples");
    await userEvent.type(screen.getByLabelText("Title"), "Milk");
    await userEvent.clear(screen.getByLabelText("Day"));
    await userEvent.type(screen.getByLabelText("Day"), "2026-11-27");
    await userEvent.click(screen.getByLabelText("Next page"));
    await screen.findByText("Cheese");
    const before = asked.length;

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    // The toast is the last step: by then the counts are refetched, the page is back to 0 and the draft is reset.
    expect(await screen.findByText("Item added")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(asked.length).toBeGreaterThan(before);
    expect(screen.getByLabelText("Title")).toHaveValue("");
    expect(screen.getByLabelText("Day")).toHaveValue("2026-11-26");
    expect(await screen.findByText("Apples")).toBeInTheDocument();
  });

  it("leavesTheQueriesThatDependOnOtherEvents", async () => {
    let counts = 0;
    answerQueries({ open: () => ++counts });
    const refetching = {
      ...contract,
      queries: { ...contract.queries, counts: { kind: "lookup", dependsOn: ["SomethingElse"] } as const },
    };
    const binding = surfaces<Queries, Commands>(refetching).bind<ItemsData, ItemsEvents>(
      ({ d, query, local, command, none }) => ({
        data: {
          counts: query("counts"),
          items: query("items", { pageSize: 2 }),
          itemsArgs: local({ search: "", status: "open", pageIndex: 0, sortBy: "", sortDirection: "" }),
          draft: local(emptyDraft),
          errors: local(noErrors),
        },
        events: {
          addItem: command("addItem", (item) => item, { errors: d.errors, onSuccess: [{ toast: "Item added" }] }),
          saveSupplier: none(),
        },
      }),
    );
    server.use(http.post("/api/commands/addItem", () => HttpResponse.json({ result: { id: "i1" }, events: [] })));
    renderItems(binding);
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Item added")).toBeInTheDocument();
    expect(counts).toBe(1);
  });

  it("fieldProblemsFillTheErrorsPath", async () => {
    answerQueries();
    let attempts = 0;
    server.use(
      http.post("/api/commands/addItem", () =>
        ++attempts === 1
          ? invalidFields({ title: "Title is required", "period.from": "Pick a start" })
          : HttpResponse.json({ result: { id: "i1" }, events: [] }),
      ),
    );
    renderItems();
    await screen.findByText("Apples");
    const add = screen.getByRole("button", { name: "Add item" });

    await userEvent.click(add);

    expect(await screen.findByText("Title is required")).toBeInTheDocument();
    expect(screen.getByText("Pick a start")).toBeInTheDocument();
    expect(screen.queryByText("Could not save")).not.toBeInTheDocument();

    await userEvent.click(add);

    expect(await screen.findByText("Item added")).toBeInTheDocument();
    expect(screen.queryByText("Title is required")).not.toBeInTheDocument();
    expect(screen.queryByText("Pick a start")).not.toBeInTheDocument();
  });

  it("aFieldProblemWithNoPlaceOnTheSurfaceIsAToast", async () => {
    answerQueries();
    server.use(
      http.post("/api/commands/addItem", () =>
        invalidFields({ title: "Title is required", "assignee.id": "No such person" }),
      ),
    );
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    expect(screen.getByText("The request has invalid fields")).toBeInTheDocument();
    expect(screen.getByText("Title is required")).toBeInTheDocument();
  });

  it("refetchesOnlyTheQueriesOnScreen", async () => {
    const asked = answerQueries();
    server.use(http.post("/api/commands/addItem", () => HttpResponse.json({ result: { id: "i1" }, events: [] })));
    renderItems();
    await screen.findByText("Apples");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");
    await screen.findByText("Nothing yet");
    await userEvent.selectOptions(screen.getByLabelText("Status"), "open");
    await screen.findByText("Apples");
    const before = asked.length;

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Item added")).toBeInTheDocument();
    const after = asked.slice(before);
    expect(after.length).toBeGreaterThan(0);
    expect(after.every((params) => params.get("status") === "open")).toBe(true);
  });

  it("fieldProblemsWithNoErrorsPathAreAToast", async () => {
    answerQueries();
    server.use(http.post("/api/commands/addItem", () => invalidFields({ title: "Title is required" })));
    renderItems(itemsBinding({ errors: false }));
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    expect(screen.getByText("The request has invalid fields")).toBeInTheDocument();
  });

  it("anotherProblemIsAToastAndKeepsTheDraft", async () => {
    answerQueries();
    server.use(http.post("/api/commands/addItem", () => stale()));
    renderItems();
    await screen.findByText("Apples");
    await userEvent.type(screen.getByLabelText("Title"), "Milk");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
    expect(screen.getByText("This record changed since you loaded it")).toBeInTheDocument();
    expect(screen.getByLabelText("Title")).toHaveValue("Milk");
  });

  it("aNetworkFailureIsAToast", async () => {
    answerQueries();
    server.use(http.post("/api/commands/addItem", () => HttpResponse.error()));
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    expect(await screen.findByText("Could not save")).toBeInTheDocument();
  });

  it("aLostSessionGoesToRouxsSessionHandling", async () => {
    const lost = vi.fn<() => void>();
    const unsubscribe = onSessionLost(lost);
    answerQueries();
    server.use(http.post("/api/commands/addItem", () => new HttpResponse(null, { status: 401 })));
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Add item" }));

    await waitFor(() => expect(lost).toHaveBeenCalledOnce());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(screen.queryByText("Could not save")).not.toBeInTheDocument();

    server.use(http.get("/api/queries/items", () => new HttpResponse(null, { status: 401 })));
    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");

    await waitFor(() => expect(lost).toHaveBeenCalledTimes(2));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    unsubscribe();
  });

  it("anUnboundEventSaysSo", async () => {
    answerQueries();
    renderItems();
    await screen.findByText("Apples");

    await userEvent.click(screen.getByRole("button", { name: "Save supplier" }));

    expect(await screen.findAllByText('"saveSupplier" is not bound to a command yet')).toHaveLength(1);
  });

  it("aQueryWithoutAPageIndexRefetchesWhenAFilterChanges", async () => {
    const asked = answerQueries();
    const binding = bind<ItemsData, ItemsEvents>(({ d, query, local, none }) => ({
      data: {
        counts: query("counts"),
        items: query("items", { status: d.itemsArgs.status, pageSize: 2 }),
        itemsArgs: local({ search: "", status: "open", pageIndex: 0, sortBy: "", sortDirection: "" }),
        draft: local(emptyDraft),
        errors: local(noErrors),
      },
      events: { addItem: none(), saveSupplier: none() },
    }));
    renderItems(binding);
    await screen.findByText("Apples");

    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");

    await waitFor(() => expect(asked.at(-1)?.toString()).toBe("status=done&pageSize=2"));
  });

  it("startsAgainWithANewBinding", async () => {
    const asked = answerQueries();
    const view = renderItems(itemsBinding({ draft: { title: "Milk", day: "" } }));
    await screen.findByText("Apples");

    view.rerender(
      <>
        <Surface surface={items} binding={itemsBinding({ draft: { title: "Eggs", day: "" } })} />
        <Toaster />
      </>,
    );

    await waitFor(() => expect(screen.getByLabelText("Title")).toHaveValue("Eggs"));
    expect(await screen.findByText("Apples")).toBeInTheDocument();
    await userEvent.selectOptions(screen.getByLabelText("Status"), "done");
    await waitFor(() => expect(asked.at(-1)?.get("status")).toBe("done"));
  });

  it("letsGoOfTheDataModelWhenItLeaves", async () => {
    const released: string[] = [];
    const subscribe = Object.getOwnPropertyDescriptor(DataModel.prototype, "subscribe")
      ?.value as DataModel["subscribe"];
    vi.spyOn(DataModel.prototype, "subscribe").mockImplementation(function (
      this: DataModel,
      path: string,
      onChange: (value: unknown) => void,
    ) {
      const subscription = subscribe.call(this, path, onChange);
      return {
        get value() {
          return subscription.value;
        },
        unsubscribe: () => {
          released.push(path);
          subscription.unsubscribe();
        },
      };
    });
    answerQueries();
    const view = renderItems();
    await screen.findByText("Apples");

    view.unmount();

    expect(released).toEqual(
      expect.arrayContaining(["/itemsArgs/status", "/itemsArgs/search", "/itemsArgs/pageIndex"]),
    );
  });
});
