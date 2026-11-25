import { Text, type TextProps } from "@chakra-ui/react";
import type { Table } from "@tanstack/react-table";
import { rowRange } from "../paging/paging";

/** "Showing 26 to 50 of 60 rows", or "7 rows" when they are all on one page; announced politely as it changes. */
export function TableStatus<T>({ table, ...props }: TextProps & { table: Table<T> }) {
  const { pageIndex, pageSize } = table.getState().pagination;
  const { first, last, total } = rowRange(
    { pageIndex, pageSize, totalElementCount: table.getRowCount() },
    table.getRowModel().rows.length,
  );
  return (
    <Text aria-live="polite" color="fg.muted" fontSize="sm" {...props}>
      {table.getPageCount() > 1 ? `Showing ${first} to ${last} of ${total} rows` : rowCount(total)}
    </Text>
  );
}

/** "1 row", "3 rows". */
function rowCount(total: number): string {
  return `${total} ${total === 1 ? "row" : "rows"}`;
}
