import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { date, text, time } from "@jwcarman/roux-web/form";
import { pageQuery, type PageDto, type PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import type { ItemDetail, ItemRow } from "../api";
import type { User } from "@jwcarman/roux-web/users";
import { queryKeys } from "../queryKeys";

/** The list's sorts: the column ids, and the server's `items.Sort` values. */
export const ITEM_SORTS = ["DAY", "TITLE", "ASSIGNEE"] as const;
export type ItemSort = (typeof ITEM_SORTS)[number];

/** The list's day filters (the server's `items.When`), and its status filters. */
export const ITEM_WHENS = ["overdue", "today", "week"] as const;
export const ITEM_STATUSES = ["open", "done"] as const;

/** The list's filters, as `/api/items` takes them. `assignee` is `me` or a user's id. */
export type ItemFilters = {
  search?: string;
  when?: string;
  assignee?: string;
  status?: string;
  /** The first and last day, both included (`2026-11-23`). */
  from?: string;
  to?: string;
};

/** The longest title and notes, and the most assignees (internal/items/input.go). */
const MAX_TITLE = 120;
const MAX_NOTES = 2000;
const MAX_ASSIGNEES = 50;

/** What a write sends. */
export interface ItemBody {
  title: string;
  notes: string;
  day: string;
  at: string | null;
  assigneeIds: string[];
  done: boolean;
  version?: number;
}

/** `/api/items`: one function per endpoint. */
export const itemsApi = {
  list: (params: PageParams & ItemFilters, signal?: AbortSignal) =>
    getJson<PageDto<ItemRow>>("items", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<ItemDetail>(path`items/${id}`, { signal }),
  add: (body: ItemBody) => sendJson<ItemDetail>("POST", "items", body),
  update: (id: string, body: ItemBody) => sendJson<ItemDetail>("PUT", path`items/${id}`, body),
  remove: (id: string) => sendJson<undefined>("DELETE", path`items/${id}`),
};

/** The list under `filters`, as a QueryTable takes it. */
export function itemsPage(filters: ItemFilters) {
  return pageQuery(queryKeys.items.list(filters), (params, signal) => itemsApi.list({ ...params, ...filters }, signal));
}

/** The most items a week shows: one page, the most the server sends at once. */
export const WEEK_LIMIT = 100;

/** The week from `monday` to its Sunday, by day then time, for everyone or for `me`. */
export function weekQuery(monday: string, sunday: string, assignee?: "me") {
  const filters = { from: monday, to: sunday, assignee };
  return queryOptions({
    queryKey: queryKeys.items.list(filters),
    queryFn: ({ signal }) =>
      itemsApi.list(
        {
          ...filters,
          pageSize: WEEK_LIMIT,
          sortBy: "DAY",
          sortDirection: "ASC",
        },
        signal,
      ),
  });
}

/** An item, for its page's loader and the page. */
export function itemQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.items.detail(id),
    queryFn: ({ signal }) => itemsApi.get(id, signal),
  });
}

/** Who an item may be assigned to: the team's active members, by name (the first 100). */
export const teamQuery = queryOptions({
  queryKey: queryKeys.team.active(),
  queryFn: async ({ signal }) =>
    (
      await getJson<PageDto<User>>("roux/users", {
        params: { status: "ACTIVE", pageSize: 100, sortBy: "NAME" },
        signal,
      })
    ).data,
});

const NOT_EMPTY = "Must not be empty";

/** An item's form, in roux's words: a time is needed unless it is all day. */
export const itemSchema = z
  .object({
    title: text().max(MAX_TITLE),
    notes: text().max(MAX_NOTES).optional(),
    day: date(),
    allDay: z.boolean(),
    at: time().optional(),
    assigneeIds: z
      .array(z.string())
      .min(1, { error: NOT_EMPTY })
      .max(MAX_ASSIGNEES, { error: `Must be at most ${MAX_ASSIGNEES}` }),
    done: z.boolean(),
  })
  .refine((item) => item.allDay || item.at !== null, {
    path: ["at"],
    error: NOT_EMPTY,
  });

export type ItemValues = z.input<typeof itemSchema>;
type ItemOutput = z.output<typeof itemSchema>;

/** A new item's blanks: all day, today, assigned to whoever adds it. */
export function blankItem(day: string, me: string): ItemValues {
  return {
    title: "",
    notes: "",
    day,
    allDay: true,
    at: "",
    assigneeIds: [me],
    done: false,
  };
}

/** An item's values, to edit it. */
export function valuesOf(item: ItemDetail): ItemValues {
  return {
    title: item.title,
    notes: item.notes,
    day: item.day,
    allDay: item.at === null,
    at: item.at ?? "",
    assigneeIds: item.assignees.map((person) => person.id),
    done: item.done,
  };
}

/** What the form's output sends; a browser may give a time with seconds, which the server refuses. */
export function bodyOf(values: ItemOutput, version?: number): ItemBody {
  return {
    title: values.title,
    notes: values.notes ?? "",
    day: values.day,
    at: values.allDay ? null : (values.at as string).slice(0, 5),
    assigneeIds: values.assigneeIds,
    done: values.done,
    version,
  };
}

/** Adds an item; the lists refresh. */
export const addItem = mutationOptions({
  mutationFn: (values: ItemOutput) => itemsApi.add(bodyOf(values)),
  meta: { refreshes: [queryKeys.items.lists()] },
});

/** Changes item `id` from `version`; a change made since answers 409. The lists and it refresh. */
export const updateItem = (id: string, version: number) =>
  mutationOptions({
    mutationFn: (values: ItemOutput) => itemsApi.update(id, bodyOf(values, version)),
    meta: {
      refreshes: [queryKeys.items.lists(), queryKeys.items.detail(id)],
    },
  });

/** Deletes item `id`; the lists refresh. */
export const deleteItem = (id: string) =>
  mutationOptions({
    mutationFn: () => itemsApi.remove(id),
    meta: { refreshes: [queryKeys.items.lists()] },
  });

const DAY = new Intl.DateTimeFormat("en-US", {
  weekday: "short",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});

/** When an item is, as the list shows it: `Tue, Nov 24 · 10:30`, or `Tue, Nov 24 · All day`. */
export function whenOf(item: Pick<ItemRow, "day" | "at">): string {
  // A date alone ("2026-11-24") is read as midnight UTC, which DAY formats in UTC.
  return `${DAY.format(new Date(item.day))} · ${item.at ?? "All day"}`;
}
