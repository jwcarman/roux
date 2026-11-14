import { Checkbox } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";

export interface SelectColumnOptions<T> {
  /** The selected rows, by key; they may span pages. */
  selected: ReadonlyMap<string, T>;
  onSelectedChange: (selected: Map<string, T>) => void;
  /** A row's stable key, such as its id: rows are new objects on every fetch. */
  keyOf: (row: T) => string;
  /** Names a row for its checkbox: "Select <label>". */
  labelOf: (row: T) => string;
  /** The header checkbox's label. */
  selectAllLabel?: string;
}

/**
 * A checkbox column for choosing rows, across pages. The header checkbox selects or unselects
 * the rows on the page shown, leaving other pages' selections alone.
 */
export function createSelectColumn<T>({
  selected,
  onSelectedChange,
  keyOf,
  labelOf,
  selectAllLabel = "Select every row on this page",
}: SelectColumnOptions<T>): ColumnDef<T, unknown> {
  return createColumnHelper<T>().display({
    id: "select",
    enableSorting: false,
    header: ({ table }) => {
      const rows = table.getRowModel().rows.map((row) => row.original);
      const chosen = rows.filter((row) => selected.has(keyOf(row))).length;
      const checked = rows.length > 0 && chosen === rows.length ? true : chosen > 0 ? "indeterminate" : false;

      function onChange(select: boolean) {
        const next = new Map(selected);
        for (const row of rows) {
          if (select) {
            next.set(keyOf(row), row);
          } else {
            next.delete(keyOf(row));
          }
        }
        onSelectedChange(next);
      }

      return (
        <Checkbox.Root
          checked={checked}
          disabled={rows.length === 0}
          onCheckedChange={() => onChange(checked !== true)}
        >
          <Checkbox.HiddenInput aria-label={selectAllLabel} />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      );
    },
    cell: ({ row }) => {
      const key = keyOf(row.original);
      const isSelected = selected.has(key);

      function onChange(select: boolean) {
        const next = new Map(selected);
        if (select) {
          next.set(key, row.original);
        } else {
          next.delete(key);
        }
        onSelectedChange(next);
      }

      return (
        <Checkbox.Root checked={isSelected} onCheckedChange={(event) => onChange(event.checked === true)}>
          <Checkbox.HiddenInput aria-label={`Select ${labelOf(row.original)}`} />
          <Checkbox.Control>
            <Checkbox.Indicator />
          </Checkbox.Control>
        </Checkbox.Root>
      );
    },
  });
}
