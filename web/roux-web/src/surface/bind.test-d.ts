// The type check (`npm run typecheck`) is this file's test: a binding that does not fit its surface or the contract
// does not compile. Each `@ts-expect-error` fails the check if the line below it ever stops being an error; nothing here
// is run.
import { expectTypeOf } from "vitest";
import type { ItemsSurfaceData, ItemsSurfaceEvents } from "../a2ui/testdata/items.surface.gen";
import { surfaces, type Binding, type IsoDate, type Ref } from ".";
import { contract, type Commands, type Queries } from "./testdata/items.contract";

const { bind } = surfaces<Queries, Commands>(contract);

const empty = { title: "", day: "" };

// A binding that fits: every path bound, every event bound or none(), a status arg (a union) bound to a string path.
const itemsBinding = bind<ItemsSurfaceData, ItemsSurfaceEvents>(({ d, query, local, command }) => ({
  data: {
    counts: query("counts"),
    items: query("items", {
      when: d.itemsArgs.when,
      status: d.itemsArgs.status,
      assignee: d.itemsArgs.assignee,
      search: d.itemsArgs.search,
      pageIndex: d.itemsArgs.pageIndex,
      sortBy: d.itemsArgs.sortBy,
      sortDirection: d.itemsArgs.sortDirection,
      pageSize: 25,
    }),
    itemsArgs: local({
      search: "",
      when: "all",
      status: "",
      assignee: "anyone",
      pageIndex: 0,
      sortBy: "",
      sortDirection: "",
    }),
    draft: local(empty),
    errors: local(empty),
  },
  events: {
    addItem: command("addItem", (item) => ({ title: item.title, day: item.day }), {
      errors: d.errors,
      onSuccess: [{ reset: d.draft }, { set: d.itemsArgs.pageIndex, value: 0 }, { toast: "Item added" }],
    }),
  },
}));
expectTypeOf(itemsBinding).toEqualTypeOf<Binding>();

type ItemsTools = Parameters<Parameters<typeof bind<ItemsSurfaceData, ItemsSurfaceEvents>>[0]>[0];
const locals = ({ local }: ItemsTools) => ({
  itemsArgs: local({ search: "", when: "", status: "", assignee: "", pageIndex: 0, sortBy: "", sortDirection: "" }),
  draft: local(empty),
  errors: local(empty),
});

export const attempts = [
  // none() leaves an event for later.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: { counts: t.query("counts"), items: t.query("items"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // A query whose answer lacks a field the surface shows: itemsWithoutStatus has no status.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      // @ts-expect-error the surface shows items' status; itemsWithoutStatus does not answer it
      data: { counts: t.query("counts"), items: t.query("itemsWithoutStatus"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // A path left unbound.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      // @ts-expect-error counts is not bound
      data: { items: t.query("items"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // An event left out.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: { counts: t.query("counts"), items: t.query("items"), ...locals(t) },
      // @ts-expect-error addItem is not bound
      events: {},
    })),
  // A command input missing a member.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: { counts: t.query("counts"), items: t.query("items"), ...locals(t) },
      // @ts-expect-error addItem's input needs a day
      events: { addItem: t.command("addItem", (item) => ({ title: item.title })) },
    })),
  // A query arg bound to a path of another type.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: {
        counts: t.query("counts"),
        // @ts-expect-error pageIndex is a number; draft.title holds a string
        items: t.query("items", { pageIndex: t.d.draft.title }),
        ...locals(t),
      },
      events: { addItem: t.none() },
    })),
  // A literal arg outside its union.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: {
        counts: t.query("counts"),
        // @ts-expect-error status is "open" or "done"
        items: t.query("items", { status: "closed" }),
        ...locals(t),
      },
      events: { addItem: t.none() },
    })),
  // A lookup is not paged.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      // @ts-expect-error counts is a lookup: it takes no pageIndex
      data: { counts: t.query("counts", { pageIndex: 0 }), items: t.query("items"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // A lookup with no args takes none, not even from a path.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      // @ts-expect-error counts takes no args
      data: { counts: t.query("counts", { bogus: t.d.draft.title }), items: t.query("items"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // A name the contract does not have.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      // @ts-expect-error there is no query named itemz
      data: { counts: t.query("counts"), items: t.query("itemz"), ...locals(t) },
      events: { addItem: t.none() },
    })),
  // A set step's value must fit its path.
  () =>
    bind<ItemsSurfaceData, ItemsSurfaceEvents>((t) => ({
      data: { counts: t.query("counts"), items: t.query("items"), ...locals(t) },
      events: {
        addItem: t.command("addItem", (item) => ({ title: item.title, day: item.day }), {
          // @ts-expect-error pageIndex holds a number
          onSuccess: [{ set: t.d.itemsArgs.pageIndex, value: "first" }],
        }),
      },
    })),
];

// The paths are the surface's: draft has a title, and no notes.
declare const d: Ref<ItemsSurfaceData>;
expectTypeOf(d.draft.title).toEqualTypeOf<Ref<string>>();
expectTypeOf(d.draft).not.toHaveProperty("notes");

expectTypeOf<IsoDate>().toEqualTypeOf<string>();
