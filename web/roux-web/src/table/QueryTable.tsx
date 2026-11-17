import { Stack } from "@chakra-ui/react";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { useQueryTable, type UseQueryTableOptions } from "./useQueryTable";
import { TableView, type TableViewProps } from "./TableView";

export type QueryTableProps<T> = UseQueryTableOptions<T> &
  Omit<TableViewProps<T>, "table" | "isLoading" | "isError" | "columns"> & {
    /** Shown above the table when a page cannot be loaded. */
    errorText?: string;
  };

/**
 * A paged, sortable table over a jpa-utils endpoint. Put any search or filter in `query`
 * (its key and its fetch); a change returns the table to its first page.
 */
export function QueryTable<T>({
  query,
  columns,
  initialSort,
  initialPageSize,
  getRowId,
  params,
  onParamsChange,
  errorText = "Could not load the rows.",
  ...props
}: QueryTableProps<T>) {
  const { table, isLoading, isError } = useQueryTable({
    query,
    columns,
    initialSort,
    initialPageSize,
    getRowId,
    params,
    onParamsChange,
  });
  return (
    <Stack gap="2" width="100%">
      {isError && <ErrorMessage>{errorText}</ErrorMessage>}
      <TableView table={table} isLoading={isLoading} isError={isError} {...props} />
    </Stack>
  );
}
