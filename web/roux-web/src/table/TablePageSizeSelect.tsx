import { HStack, NativeSelect, Text } from "@chakra-ui/react";
import type { Table } from "@tanstack/react-table";
import { MAX_PAGE_SIZE } from "../paging/paging";

export const PAGE_SIZES = [10, 25, 50, 100];

export interface TablePageSizeSelectProps<T> {
  table: Table<T>;
  /** The sizes offered; any above {@link MAX_PAGE_SIZE} are left out, as a Paginator caps them. */
  pageSizes?: number[];
}

/** The sizes {@link TablePageSizeSelect} offers, smallest first: `pageSizes` a Paginator returns, and `current`. */
export function offeredPageSizes(pageSizes: number[], current: number): number[] {
  return [...new Set([...pageSizes.filter((size) => size > 0 && size <= MAX_PAGE_SIZE), current])].sort(
    (a, b) => a - b,
  );
}

/** Rows per page. */
export function TablePageSizeSelect<T>({ table, pageSizes = PAGE_SIZES }: TablePageSizeSelectProps<T>) {
  const current = table.getState().pagination.pageSize;
  const offered = offeredPageSizes(pageSizes, current);
  return (
    <HStack gap="2">
      <NativeSelect.Root size="sm" width="80px">
        <NativeSelect.Field
          aria-label="Rows per page"
          value={current}
          onChange={(event) => table.setPageSize(Number(event.target.value))}
        >
          {offered.map((size) => (
            <option key={size} value={size}>
              {size}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
      <Text fontSize="sm" color="fg.muted" aria-hidden>
        per page
      </Text>
    </HStack>
  );
}
