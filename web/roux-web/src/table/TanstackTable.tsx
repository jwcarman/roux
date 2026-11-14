import { Box, Button, Center, Spinner, Table, type TableRootProps } from "@chakra-ui/react";
import { flexRender, type Header, type Table as ReactTable } from "@tanstack/react-table";
import { LuArrowDown, LuArrowUp, LuArrowUpDown } from "react-icons/lu";

export type TanstackTableProps<T> = Omit<TableRootProps, "children"> & {
  table: ReactTable<T>;
  /** True while the first rows load: shows a spinner instead of {@link emptyText}. */
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
  return <LuArrowUpDown aria-hidden opacity={0.3} />;
}

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
    <Box bg="bg.panel" borderWidth="1px" borderRadius="lg" borderColor="border" width="100%" overflowX="auto">
      <Table.Root striped size="md" width="100%" {...props}>
        <Table.Header>
          {table.getHeaderGroups().map((headerGroup) => (
            <Table.Row key={headerGroup.id} bg="bg.subtle">
              {headerGroup.headers.map((header) => {
                const content = header.isPlaceholder
                  ? null
                  : flexRender(header.column.columnDef.header, header.getContext());
                if (!header.column.getCanSort()) {
                  return <Table.ColumnHeader key={header.id}>{content}</Table.ColumnHeader>;
                }
                return (
                  <Table.ColumnHeader key={header.id} aria-sort={ariaSort(header)}>
                    <Button size="xs" variant="ghost" onClick={header.column.getToggleSortingHandler()}>
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
                <Table.Cell key={cell.id}>{flexRender(cell.column.columnDef.cell, cell.getContext())}</Table.Cell>
              ))}
            </Table.Row>
          ))}
          {rows.length === 0 && !isError && (
            <Table.Row>
              <Table.Cell colSpan={columnCount}>
                <Center py="4">
                  {isLoading ? (
                    <Box role="status" aria-label="Loading">
                      <Spinner size="sm" />
                    </Box>
                  ) : (
                    <Box color="fg.muted">{emptyText}</Box>
                  )}
                </Center>
              </Table.Cell>
            </Table.Row>
          )}
        </Table.Body>
      </Table.Root>
    </Box>
  );
}
