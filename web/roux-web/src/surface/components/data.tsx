// Records from the data model: DataTable (roux's TableView) for desks, CardList for phones.
import { Badge, Box, Card, Link as ChakraLink, HStack, Text, VStack } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import {
  functionalUpdate,
  getCoreRowModel,
  useReactTable,
  type ColumnDef,
  type SortingState,
} from "@tanstack/react-table";
import type { z } from "zod3";
import { rouxCatalog } from "../../a2ui";
import { TableView } from "../../table";
import { defineComponent, formatValue, TONES, useComponentId, type Tone } from "./layout";

const { CardList: CardListApi, DataTable: DataTableApi } = rouxCatalog.apis;

type Record = { [field: string]: unknown };
type Tones = { [value: string]: Tone };

const asRows = (rows: unknown): Record[] => (Array.isArray(rows) ? (rows as Record[]) : []);

function ToneBadge({ value, tones }: { value: unknown; tones?: Tones }) {
  const text = formatValue(value);
  const palette = TONES[tones?.[text] ?? "neutral"];
  return (
    <Badge colorPalette={palette} data-palette={palette}>
      {text}
    </Badge>
  );
}

type Columns = z.infer<typeof DataTableApi.schema>["columns"];
type Column = Columns[number];

/** A page of a list the server pages, as roux's page.Page answers it. */
type ServerPage = {
  data: Record[];
  pagination: { pageIndex: number; pageSize: number; totalElementCount: number; totalPageCount: number };
};
const isServerPage = (rows: unknown): rows is ServerPage =>
  Array.isArray((rows as Partial<ServerPage> | undefined)?.data);

/** A cell's text, or, for a column with a link, a link to the app route whose params are the row's fields. */
function Cell({ column, value, row }: { column: Column; value: unknown; row: Record }) {
  if (column.format === "badge") return <ToneBadge value={value} tones={column.tones} />;
  const text = formatValue(value, column.format);
  if (!column.link) return text;
  const params = Object.fromEntries(Object.entries(column.link.params).map(([name, field]) => [name, row[field]]));
  return (
    <ChakraLink asChild>
      <RouterLink to={column.link.to} params={params}>
        {text}
      </RouterLink>
    </ChakraLink>
  );
}

type Direction = "ASC" | "DESC";

/** The table's sort state: sorted by `sortBy`, descending when `direction` says DESC; not sorted without a `sortBy`. */
export function sortingOf(sortBy: string | undefined, direction: Direction | undefined): SortingState {
  return sortBy ? [{ id: sortBy, desc: direction === "DESC" }] : [];
}

type Paging = {
  setPageIndex: (index: number) => void;
  sortBy?: string;
  sortDirection?: Direction;
  setSortBy: (sortBy: string) => void;
  setSortDirection: (direction: Direction) => void;
};

/**
 * The server pages and sorts: the table shows the page it was given. Paging writes `pageIndex`; a sortable
 * header writes `sortBy` (its column's `sort`) and flips `sortDirection`, and goes back to the first page.
 */
function ServerTableView({
  columns,
  page,
  paging,
  emptyText,
}: {
  columns: Columns;
  page: ServerPage;
  paging: Paging;
  emptyText?: string;
}) {
  const defs = columns.map<ColumnDef<Record>>((c) => ({
    id: c.sort ?? c.field,
    header: c.header,
    enableSorting: c.sort !== undefined,
    sortDescFirst: false,
    accessorFn: (row) => row[c.field],
    cell: (info) => <Cell column={c} value={info.getValue()} row={info.row.original} />,
  }));
  const { pageIndex, pageSize, totalElementCount, totalPageCount } = page.pagination;
  const sorting = sortingOf(paging.sortBy, paging.sortDirection);
  const table = useReactTable({
    data: page.data,
    columns: defs,
    getCoreRowModel: getCoreRowModel(),
    manualPagination: true,
    enableSortingRemoval: false,
    rowCount: totalElementCount,
    pageCount: totalPageCount,
    state: { pagination: { pageIndex, pageSize }, sorting },
    onPaginationChange: (updater) => {
      paging.setPageIndex(functionalUpdate(updater, { pageIndex, pageSize }).pageIndex);
    },
    onSortingChange: (updater) => {
      const [next] = functionalUpdate(updater, sorting);
      paging.setSortBy(next.id);
      paging.setSortDirection(next.desc ? "DESC" : "ASC");
      paging.setPageIndex(0);
    },
  });
  return <TableView table={table} emptyText={emptyText ?? "Nothing yet"} fixedPageSize />;
}

const DataTable = defineComponent(DataTableApi, ({ props }) => (
  // The table scrolls inside its box rather than spilling out of its Card.
  <Box data-component-id={useComponentId()} width="100%" minW="0" maxW="100%" overflowX="auto">
    {isServerPage(props.rows) ? (
      <ServerTableView columns={props.columns} page={props.rows} paging={props} emptyText={props.emptyText} />
    ) : (
      <Text color="fg.muted">{props.emptyText ?? "Nothing yet"}</Text>
    )}
  </Box>
));

const CardList = defineComponent(CardListApi, ({ props }) => {
  const rows = asRows(props.rows);
  return (
    <VStack data-component-id={useComponentId()} align="stretch" gap="3">
      {rows.length === 0 ? (
        <Text color="fg.muted">{props.emptyText ?? "Nothing yet"}</Text>
      ) : (
        rows.map((row, i) => (
          <Card.Root key={i} size="sm">
            <Card.Body>
              <HStack justify="space-between" align="flex-start" gap="3">
                <VStack align="stretch" gap="1" minW="0">
                  <Text fontWeight="bold">{formatValue(row[props.title])}</Text>
                  {props.lines.map((line) => (
                    <Text key={line.field} color="fg.muted">
                      {formatValue(row[line.field], line.format)}
                    </Text>
                  ))}
                </VStack>
                {props.badge && <ToneBadge value={row[props.badge.field]} tones={props.badge.tones} />}
              </HStack>
            </Card.Body>
          </Card.Root>
        ))
      )}
    </VStack>
  );
});

export const dataComponents = [DataTable, CardList];
