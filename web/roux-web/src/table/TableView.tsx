import { Flex, Stack } from "@chakra-ui/react";
import { offeredPageSizes, PAGE_SIZES, TablePageSizeSelect } from "./TablePageSizeSelect";
import { TablePagination } from "./TablePagination";
import { TableStatus } from "./TableStatus";
import { TanstackTable, type TanstackTableProps } from "./TanstackTable";

export type TableViewProps<T> = TanstackTableProps<T> & {
  /** The page sizes offered; see {@link TablePageSizeSelect}. */
  pageSizes?: number[];
};

/**
 * A paged table: the rows, then, once there are rows, the pager (when there is more than one page),
 * the row count, and the page size (when a smaller one would show fewer rows).
 */
export function TableView<T>({ table, pageSizes = PAGE_SIZES, ...props }: TableViewProps<T>) {
  const rowCount = table.getRowCount();
  const [smallest] = offeredPageSizes(pageSizes, table.getState().pagination.pageSize);
  return (
    <Stack gap="2" width="100%">
      <TanstackTable table={table} {...props} />
      {rowCount > 0 && (
        <Flex wrap="wrap" gap="3" align="center" justify="space-between">
          {table.getPageCount() > 1 && <TablePagination table={table} />}
          <TableStatus table={table} />
          {rowCount > smallest && <TablePageSizeSelect table={table} pageSizes={pageSizes} />}
        </Flex>
      )}
    </Stack>
  );
}
