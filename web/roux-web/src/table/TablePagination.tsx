import { HStack, IconButton, InputGroup, NumberInput } from "@chakra-ui/react";
import type { Table } from "@tanstack/react-table";
import { LuChevronLeft, LuChevronRight, LuChevronsLeft, LuChevronsRight } from "react-icons/lu";

/** First, previous, a page number field, next and last; a page typed past the end goes to the last. For more than one page. */
export function TablePagination<T>({ table }: Readonly<{ table: Table<T> }>) {
  const pageCount = table.getPageCount();
  const pageIndex = table.getState().pagination.pageIndex;

  function goTo(pageNumber: number) {
    if (Number.isFinite(pageNumber)) {
      table.setPageIndex(Math.min(Math.max(Math.floor(pageNumber), 1), pageCount) - 1);
    }
  }

  return (
    <HStack gap="1">
      <IconButton
        aria-label="First page"
        size="sm"
        variant="ghost"
        disabled={!table.getCanPreviousPage()}
        onClick={() => table.firstPage()}
      >
        <LuChevronsLeft />
      </IconButton>
      <IconButton
        aria-label="Previous page"
        size="sm"
        variant="ghost"
        disabled={!table.getCanPreviousPage()}
        onClick={() => table.previousPage()}
      >
        <LuChevronLeft />
      </IconButton>
      <InputGroup startAddon="Page" endAddon={`of ${pageCount}`} width="auto">
        <NumberInput.Root
          width="80px"
          min={1}
          max={pageCount}
          value={String(pageIndex + 1)}
          onValueChange={({ valueAsNumber }) => goTo(valueAsNumber)}
        >
          <NumberInput.Input aria-label="Page" onFocus={(event) => event.target.select()} />
          <NumberInput.Control>
            <NumberInput.IncrementTrigger />
            <NumberInput.DecrementTrigger />
          </NumberInput.Control>
        </NumberInput.Root>
      </InputGroup>
      <IconButton
        aria-label="Next page"
        size="sm"
        variant="ghost"
        disabled={!table.getCanNextPage()}
        onClick={() => table.nextPage()}
      >
        <LuChevronRight />
      </IconButton>
      <IconButton
        aria-label="Last page"
        size="sm"
        variant="ghost"
        disabled={!table.getCanNextPage()}
        onClick={() => table.lastPage()}
      >
        <LuChevronsRight />
      </IconButton>
    </HStack>
  );
}
