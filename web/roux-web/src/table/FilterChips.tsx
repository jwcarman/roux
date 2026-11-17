import { Button, Group } from "@chakra-ui/react";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

interface FilterChipsBase<T extends string> {
  /** Names the group for screen readers, such as "Status". */
  label: string;
  options: readonly FilterOption<T>[];
  /** The chosen value; undefined when the URL has none (no filter, or `defaultValue`). */
  value: T | undefined;
  /** Receives `undefined` for "All" or, with a `defaultValue`, for the default chip. */
  onChange: (value: T | undefined) => void;
}

/** What an unchosen filter means: no filter (an "All" chip), or a default (no chip for "none"). Not both. */
type FilterChipsUnset<T extends string> =
  | {
      /** Adds a first chip that clears the filter, such as "All". */
      allLabel?: string;
      defaultValue?: never;
    }
  | {
      /**
       * The chip shown chosen while `value` is undefined (the list's own default, such as "Active").
       * Choosing it reports `undefined`, so the default stays out of the URL. Excludes `allLabel`:
       * with a default there is no unfiltered state to offer.
       */
      defaultValue: NoInfer<T>;
      allLabel?: never;
    };

export type FilterChipsProps<T extends string> = FilterChipsBase<T> & FilterChipsUnset<T>;

/** One filter as a row of toggle chips (`aria-pressed`); one chip is chosen at a time. */
export function FilterChips<T extends string>({
  label,
  options,
  value,
  onChange,
  allLabel,
  defaultValue,
}: FilterChipsProps<T>) {
  const chosen = value ?? defaultValue;
  const chips: { value: T | undefined; label: string }[] = allLabel
    ? [{ value: undefined, label: allLabel }, ...options]
    : [...options];
  return (
    <Group role="group" aria-label={label} attached={false} gap="2" wrap="wrap">
      {chips.map((chip) => {
        const pressed = chip.value === chosen;
        return (
          <Button
            key={chip.label}
            size="xs"
            borderRadius="full"
            variant={pressed ? "solid" : "outline"}
            aria-pressed={pressed}
            onClick={() => onChange(chip.value === defaultValue ? undefined : chip.value)}
          >
            {chip.label}
          </Button>
        );
      })}
    </Group>
  );
}
