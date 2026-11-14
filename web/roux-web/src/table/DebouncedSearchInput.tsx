import { Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { searchTermOf } from "../paging/paging";
import { useDebounce } from "./useDebounce";
import { SearchInput, type SearchInputProps } from "./SearchInput";

/** What {@link DebouncedSearchInput} takes: a {@link SearchInput}'s props, minus the value it manages. */
export type DebouncedSearchInputProps = Omit<SearchInputProps, "value" | "onChange"> & {
  /**
   * The search in effect, such as the one in the URL: the field starts from it and follows it when
   * it changes elsewhere (Back, a link), without reporting it back.
   */
  term?: string;
  /** Called with the trimmed term once typing pauses, and with `undefined` when there is none. */
  onSearchChange: (term: string | undefined) => void;
  /** Shorter terms do not search; 0, the default, searches from the first character. */
  minLength?: number;
  debounceMs?: number;
};

/** A search field that reports its term once typing pauses, and only when the term changes. */
export function DebouncedSearchInput({
  term: given,
  onSearchChange,
  minLength = 0,
  debounceMs = 300,
  ...props
}: DebouncedSearchInputProps) {
  const [text, setText] = useState(given ?? "");
  const term = searchTermOf(useDebounce(text, debounceMs), minLength);

  const onSearchChangeRef = useRef(onSearchChange);
  useEffect(() => {
    onSearchChangeRef.current = onSearchChange;
  }, [onSearchChange]);

  const reported = useRef<string | undefined>(given);
  useEffect(() => {
    if (given !== reported.current) {
      reported.current = given;
      setText(given ?? "");
    }
  }, [given]);

  useEffect(() => {
    if (term !== reported.current) {
      reported.current = term;
      onSearchChangeRef.current(term);
    }
  }, [term]);

  const typed = text.trim().length;
  return (
    <Stack gap="1">
      <SearchInput value={text} onChange={setText} {...props} />
      {typed > 0 && typed < minLength && (
        <Text fontSize="sm" color="fg.muted">
          Type at least {minLength} characters to search
        </Text>
      )}
    </Stack>
  );
}
