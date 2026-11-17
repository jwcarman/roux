import { Stack } from "@chakra-ui/react";
import { useQuery, type UseQueryOptions, type QueryKey } from "@tanstack/react-query";
import {
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type ColumnSort,
  type SortingState,
} from "@tanstack/react-table";
import { useState } from "react";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { TanstackTable, type TanstackTableProps } from "./TanstackTable";

export type SimpleQueryTableProps<T, K extends QueryKey = QueryKey> = Omit<
  TanstackTableProps<T>,
  "table" | "isLoading" | "isError" | "columns"
> & {
  /** The whole list's query, from its resource module (what `queryOptions({ ... })` returns). */
  query: UseQueryOptions<T[], Error, T[], K>;
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
export function SimpleQueryTable<T, K extends QueryKey = QueryKey>({
  query,
  columns,
  initialSort,
  enabled = true,
  getRowId,
  errorText = "Could not load the rows.",
  ...props
}: SimpleQueryTableProps<T, K>) {
  const [sorting, setSorting] = useState<SortingState>(initialSort ? [initialSort] : EMPTY);
  const { data, isLoading, isError } = useQuery({ ...query, enabled });

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
