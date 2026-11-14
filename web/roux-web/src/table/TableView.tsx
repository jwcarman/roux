import { Flex, Stack } from "@chakra-ui/react";
import { TablePageSizeSelect } from "./TablePageSizeSelect";
import { TablePagination } from "./TablePagination";
import { TableStatus } from "./TableStatus";
import { TanstackTable, type TanstackTableProps } from "./TanstackTable";

export type TableViewProps<T> = TanstackTableProps<T> & {
  /** The page sizes offered; see {@link TablePageSizeSelect}. */
  pageSizes?: number[];
};

/** A paged table: the rows, then the pager, the row count and the page size, once there are rows. */
export function TableView<T>({ table, pageSizes, ...props }: TableViewProps<T>) {
  return (
    <Stack gap="2" width="100%">
      <TanstackTable table={table} {...props} />
      {table.getRowCount() > 0 && (
        <Flex wrap="wrap" gap="3" align="center" justify="space-between">
          <TablePagination table={table} />
          <TableStatus table={table} />
          <TablePageSizeSelect table={table} pageSizes={pageSizes} />
        </Flex>
      )}
    </Stack>
  );
}
