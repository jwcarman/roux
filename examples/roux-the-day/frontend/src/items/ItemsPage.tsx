import { Badge, Flex, Link, Stack } from "@chakra-ui/react";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import { DEFAULT_PAGE_SIZE, DebouncedSearchInput, FilterChips, QueryTable } from "@jwcarman/roux-web/table";
import type { ItemRow } from "../api";
import { ITEMS_WRITE } from "../permissions.gen";
import { useMe } from "../routes/_signedIn";
import { AddItem } from "./AddItem";
import { ITEM_SORTS, ITEM_STATUSES, ITEM_WHENS, itemsPage, whenOf, type ItemSort } from "./items";

/** The list's URL: page, sort and search, plus its filters. `assignee` is `me` or a user's id. */
export type ItemsSearch = TableSearch<ItemSort> & {
  when?: (typeof ITEM_WHENS)[number];
  status?: (typeof ITEM_STATUSES)[number];
  assignee?: string;
};

/** The list's defaults, left out of the URL. */
export const ITEMS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "DAY",
  sortDirection: "ASC",
} as const satisfies TableSearch<ItemSort>;

const WHEN_CHIPS = [
  { value: "overdue", label: "Overdue" },
  { value: "today", label: "Today" },
  { value: "week", label: "This week" },
] as const;

const STATUS_CHIPS = [
  { value: "open", label: "Open" },
  { value: "done", label: "Done" },
] as const;

const ASSIGNEE_CHIPS = [{ value: "me", label: "Mine" }] as const;

const column = createColumnHelper<ItemRow>();

const COLUMNS: ColumnDef<ItemRow, unknown>[] = [
  column.accessor((item) => whenOf(item), {
    id: "DAY" satisfies ItemSort,
    header: "When",
  }),
  column.accessor("title", {
    id: "TITLE" satisfies ItemSort,
    header: "Title",
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/items/$itemId" params={{ itemId: info.row.original.id }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor((item) => item.assigneeNames.join(", "), {
    id: "ASSIGNEE" satisfies ItemSort,
    header: "Assigned to",
  }),
  column.accessor("done", {
    id: "STATUS",
    header: "Status",
    enableSorting: false,
    cell: (info) => (info.getValue() ? <Badge colorPalette="green">Done</Badge> : <Badge>Open</Badge>),
  }),
];

const route = getRouteApi("/_signedIn/items/");

/** The team's items: searchable, filtered by when, whose and status, sorted and paged, all in the URL. */
export function Items() {
  const me = useMe();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const filters = {
    search: search.search,
    when: search.when,
    assignee: search.assignee,
    status: search.status,
  };
  const filterBy = (change: Partial<ItemsSearch>) =>
    navigate({
      search: (previous) => ({ ...previous, ...change, pageIndex: undefined }),
    });

  return (
    <Stack gap="6">
      <PageHeader title="Items">{me.permissions.includes(ITEMS_WRITE) && <AddItem />}</PageHeader>
      <DebouncedSearchInput
        label="Search items"
        placeholder="Search items"
        term={search.search}
        // Typing replaces the history entry: Back skips the letters, not the searches.
        onSearchChange={(term) =>
          navigate({
            search: (previous) => ({
              ...previous,
              search: term,
              pageIndex: undefined,
            }),
            replace: true,
          })
        }
      />
      <Flex gap="4" wrap="wrap">
        <FilterChips
          label="When"
          options={WHEN_CHIPS}
          value={search.when}
          allLabel="Any time"
          onChange={(when) => filterBy({ when })}
        />
        <FilterChips
          label="Assigned to"
          options={ASSIGNEE_CHIPS}
          value={search.assignee === "me" ? "me" : undefined}
          allLabel="Anyone"
          onChange={(assignee) => filterBy({ assignee })}
        />
        <FilterChips
          label="Status"
          options={STATUS_CHIPS}
          value={search.status}
          allLabel="Any status"
          onChange={(status) => filterBy({ status })}
        />
      </Flex>
      <QueryTable
        aria-label="Items"
        query={itemsPage(filters)}
        columns={COLUMNS}
        initialSort={{ id: ITEMS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...next,
              sortBy: ITEM_SORTS.find((sort) => sort === next.sortBy),
            }),
          })
        }
        emptyText="No items found."
        errorText="Could not load the items."
      />
    </Stack>
  );
}
