import { IconButton, Input, InputGroup, type InputProps } from "@chakra-ui/react";
import type { KeyboardEvent } from "react";
import { LuSearch, LuX } from "react-icons/lu";

/** What {@link SearchInput} takes. */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the field loses focus. */
  onBlur?: () => void;
  /** The field's accessible name, such as "Search members". */
  label: string;
  placeholder?: string;
  width?: string;
  size?: InputProps["size"];
}

/** A search field with a clear button; Escape clears it too. */
export function SearchInput({
  value,
  onChange,
  onBlur,
  label,
  placeholder,
  width = "100%",
  size = "md",
}: SearchInputProps) {
  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      onChange("");
    }
  }

  return (
    <InputGroup
      width={width}
      startElement={<LuSearch aria-hidden />}
      endElement={
        value ? (
          <IconButton aria-label="Clear search" size="xs" variant="ghost" onClick={() => onChange("")}>
            <LuX />
          </IconButton>
        ) : undefined
      }
    >
      <Input
        type="search"
        aria-label={label}
        size={size}
        placeholder={placeholder}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      />
    </InputGroup>
  );
}
