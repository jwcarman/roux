import { Button, Group } from "@chakra-ui/react";

export interface FilterOption<T extends string> {
  value: T;
  label: string;
}

export interface FilterChipsProps<T extends string> {
  /** Names the group for screen readers, such as "Status". */
  label: string;
  options: readonly FilterOption<T>[];
  /** The chosen value; undefined for no filter. */
  value: T | undefined;
  onChange: (value: T | undefined) => void;
  /** Adds a first chip that clears the filter, such as "All". */
  allLabel?: string;
}

/** One filter as a row of toggle chips (`aria-pressed`); one chip is chosen at a time. */
export function FilterChips<T extends string>({ label, options, value, onChange, allLabel }: FilterChipsProps<T>) {
  const chips: { value: T | undefined; label: string }[] = allLabel
    ? [{ value: undefined, label: allLabel }, ...options]
    : [...options];
  return (
    <Group role="group" aria-label={label} attached={false} gap="2" wrap="wrap">
      {chips.map((chip) => {
        const pressed = chip.value === value;
        return (
          <Button
            key={chip.label}
            size="xs"
            borderRadius="full"
            variant={pressed ? "solid" : "outline"}
            aria-pressed={pressed}
            onClick={() => onChange(chip.value)}
          >
            {chip.label}
          </Button>
        );
      })}
    </Group>
  );
}
