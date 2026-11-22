import { Box, Button, Center, Icon, Skeleton, Table, VisuallyHidden, type TableRootProps } from "@chakra-ui/react";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";

export type TanstackTableProps<T> = Omit<TableRootProps, "children"> & {
  table: ReactTable<T>;
  /** True while the first rows load: placeholder rows instead of {@link emptyText}. */
  isLoading?: boolean;
  /** True when the rows could not be loaded: the error says so, not {@link emptyText}. */
  isError?: boolean;
  /** Shown in place of rows when there are none. */
  emptyText?: string;
};

function ariaSort<T>(header: Header<T, unknown>): "ascending" | "descending" | "none" {
  const sorted = header.column.getIsSorted();
  if (sorted === "asc") {
    return "ascending";
  }
  return sorted === "desc" ? "descending" : "none";
}

function SortIcon({ sorted }: { sorted: false | "asc" | "desc" }) {
  if (sorted === "asc") {
    return <LuArrowUp aria-hidden />;
  }
  if (sorted === "desc") {
    return <LuArrowDown aria-hidden />;
  }
  // Hidden until the pointer or the keyboard reaches the heading, so only the sorted column shows an arrow.
  return (
    <Icon
      as={LuArrowUpDown}
      aria-hidden
      opacity="0"
      _groupHover={{ opacity: 0.5 }}
      _groupFocusVisible={{ opacity: 0.5 }}
    />
  );
}

/** How many placeholder rows stand in while the first rows load. */
const LOADING_ROWS = 3;

/** Every cell's room: a little more than Chakra's, the same for headings and values. */
const CELL = { px: "4", py: "3.5" } as const;

/** A heading: small and muted, so the values carry the table. */
const HEADING = { ...CELL, color: "fg.muted", textStyle: "xs" } as const;

/**
 * Renders a TanStack table. A sortable column's header is a button, so it sorts from the
 * keyboard too, and carries `aria-sort`; a column with `enableSorting: false` gets neither.
 */
export function TanstackTable<T>({
  table,
  isLoading = false,
  isError = false,
  emptyText = "No rows.",
  ...props
}: TanstackTableProps<T>) {
  const rows = table.getRowModel().rows;
  const columnCount = table.getVisibleLeafColumns().length;

  return (
    // Only a phone's frame scrolls sideways: one that scrolls would hold the sticky headings in place.
    <Box width="100%" overflowX={{ base: "auto", md: "visible" }}>
      <Table.Root interactive stickyHeader size="md" width="100%" {...props}>
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id}>
              {headerGroup.headers.map((header) => {
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                if (!header.column.getCanSort()) {
                  return (
                    <Table.ColumnHeader key={header.id} {...HEADING}>
                      {content}
                    </Table.ColumnHeader>
                  );
                }
                return (
                  <Table.ColumnHeader key={header.id} aria-sort={ariaSort(header)} {...HEADING}>
                    {/* Its padding taken back, so the heading starts where the values under it do. */}
                    <Button
                      className="group"
                      size="xs"
                      variant="ghost"
                      ms="-2.5"
                      color="inherit"
                      onClick={header.column.getToggleSortingHandler()}
                    >
                      {content}
                      <SortIcon sorted={header.column.getIsSorted()} />
                    </Button>
                  </Table.ColumnHeader>
                );
              })}
            </Table.Row>
          ))}
        </Table.Header>
        <Table.Body>
          {rows.map((row) => (
            <Table.Row key={row.id}>
              {row.getVisibleCells().map((cell) => (
                <Table.Cell key={cell.id} {...CELL}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </Table.Cell>
              ))}
            </Table.Row>
          ))}
          {rows.length === 0 &&
            isLoading &&
            Array.from({ length: LOADING_ROWS }, (_, index) => (
              <Table.Row key={index}>
                {Array.from({ length: columnCount }, (_, column) => (
                  <Table.Cell key={column} {...CELL}>
                    <Skeleton height="4" />
                  </Table.Cell>
                ))}
              </Table.Row>
            ))}
          {rows.length === 0 && !isLoading && !isError && (
            <Table.Row>
              <Table.Cell colSpan={columnCount} {...CELL}>
                <Center py="4" color="fg.muted">
                  {emptyText}
                </Center>
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table.Root>
      {rows.length === 0 && isLoading && <VisuallyHidden role="status" aria-label="Loading" />}
    </Box>
  );
}
