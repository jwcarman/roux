import { IconButton, Input, InputGroup, type InputProps } from "@chakra-ui/react";
import { useRef, type KeyboardEvent } from "react";
import { LuSearch, LuX } from "react-icons/lu";

/** What {@link SearchInput} takes. */
export interface SearchInputProps {
  value: string;
  onChange: (value: string) => void;
  /** Called when the field loses focus, except when the press that caused it is on the clear button. */
  onBlur?: () => void;
  /** Called after the clear button or Escape empties the field, with `onChange("")`. */
  onClear?: () => void;
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
  onClear,
  label,
  placeholder,
  width = "100%",
  size = "md",
}: SearchInputProps) {
  const pressingClear = useRef(false);

  function clear() {
    pressingClear.current = false;
    onChange("");
    onClear?.();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === "Escape") {
      clear();
    }
  }

  function onInputBlur() {
    if (!pressingClear.current) {
      onBlur?.();
    }
  }

  return (
    <InputGroup
      width={width}
      startElement={<LuSearch aria-hidden />}
      endElement={
        value ? (
          <IconButton
            onMouseDown={() => (pressingClear.current = true)}
            aria-label="Clear search"
            size="xs"
            variant="ghost"
            onClick={clear}
          >
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
        onBlur={onInputBlur}
      />
    </InputGroup>
  );
}
