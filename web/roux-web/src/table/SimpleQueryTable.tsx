import { Stack } from "@chakra-ui/react";
import { useQuery, type QueryKey } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSort,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ErrorMessage } from "./ErrorMessage";
import { TanstackTable, type TanstackTableProps } from "./TanstackTable";

export type SimpleQueryTableProps<T> = Omit<TanstackTableProps<T>, "table" | "isLoading" | "isError" | "columns"> & {
  queryKey: QueryKey;
  /** Fetches every row at once; for a short list, or with `fetchAllPages`. */
  query: () => Promise<T[]>;
  columns: ColumnDef<T, unknown>[];
  initialSort?: ColumnSort;
  /** False holds the fetch, for example until a filter it needs is chosen. */
  enabled?: boolean;
  getRowId?: (row: T) => string;
  /** Shown above the table when the rows cannot be loaded. */
  errorText?: string;
};

const EMPTY: never[] = [];

/** A table over a list fetched whole and sorted in the browser: no paging, no refetch to sort. */
export function SimpleQueryTable<T>({
  queryKey,
  query,
  columns,
  initialSort,
  enabled = true,
  getRowId,
  errorText = "Could not load the rows.",
  ...props
}: SimpleQueryTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : EMPTY);
  const { data, isLoading, isError } = useQuery({ queryKey, queryFn: query, enabled });

  const table = useReactTable<T>({
    data: data ?? EMPTY,
    columns,
    getRowId,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    enableMultiSort: false,
    enableSortingRemoval: false,
  });

  return (
    <Stack gap="2" width="100%">
      {isError && <ErrorMessage>{errorText}</ErrorMessage>}
      <TanstackTable table={table} isLoading={isLoading} isError={isError} {...props} />
    </Stack>
  );
}
