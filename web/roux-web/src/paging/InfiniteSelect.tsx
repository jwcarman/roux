import { Center, Combobox, createListCollection, Field, Spinner, Stack, Text } from "@chakra-ui/react";
import { useInfiniteQuery, type QueryKey } from "@tanstack/react-query";
import { useMemo, useState, type UIEvent } from "react";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { MAX_PAGE_SIZE, nextPageIndex, searchTermOf, type PageDto } from "./paging";
import { useDebounce } from "../table/useDebounce";

/** What an {@link InfiniteSelect} asks its endpoint for. */
export interface InfiniteSelectQuery {
  search: string | undefined;
  pageIndex: number;
  pageSize: number;
}

/** What {@link InfiniteSelect} takes. */
export interface InfiniteSelectProps<T> {
  label: string;
  /** The chosen item's id. The field is controlled: it shows what `value` names. */
  value?: string;
  /** Called with the chosen item's id, or `undefined` when the choice is cleared. */
  onChange: (id: string | undefined) => void;
  queryKey: QueryKey;
  queryFn: (query: InfiniteSelectQuery) => Promise<PageDto<T>>;
  getItemId: (item: T) => string;
  getItemLabel: (item: T) => string;
  getItemSubtext?: (item: T) => string;
  /** The item `value` names when the field first shows, so it can be named before anything loads. */
  initialItem?: T;
  placeholder?: string;
  /** Shorter terms do not search; 0, the default, searches from the first character. */
  minSearchLength?: number;
  /** A required field offers no clear button. */
  required?: boolean;
  invalid?: boolean;
  /** Rows per page, at most {@link MAX_PAGE_SIZE}. */
  pageSize?: number;
}

/** How near the bottom, in pixels, scrolling loads the next page. */
const LOAD_MARGIN = 50;

/**
 * Picks one item from a jpa-utils paged endpoint: Chakra's combobox (ARIA combobox and listbox,
 * arrow keys, Enter, Escape) over a server-side search that loads more as the list scrolls.
 * Fetches nothing until opened.
 */
export function InfiniteSelect<T>({
  label,
  value,
  onChange,
  queryKey,
  queryFn,
  getItemId,
  getItemLabel,
  getItemSubtext,
  initialItem,
  placeholder,
  minSearchLength = 0,
  required = false,
  invalid = false,
  pageSize = 20,
}: InfiniteSelectProps<T>) {
  const [open, setOpen] = useState(false);
  const [text, setText] = useState("");
  const search = searchTermOf(useDebounce(text, 300), minSearchLength);
  const size = Math.min(Math.max(1, Math.floor(pageSize)), MAX_PAGE_SIZE);
  // The item last chosen (or given), so the field can name it even when no loaded page holds it.
  const [known, setKnown] = useState<T | undefined>(initialItem);

  const { data, isLoading, isError, fetchNextPage, hasNextPage, isFetchingNextPage } = useInfiniteQuery({
    queryKey: [...queryKey, { search, pageSize: size }],
    queryFn: ({ pageParam }) => queryFn({ search, pageIndex: pageParam, pageSize: size }),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PageDto<T>) => nextPageIndex(lastPage),
    enabled: open,
  });

  const items = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);
  const collection = useMemo(() => {
    const all = known && !items.some((item) => getItemId(item) === getItemId(known)) ? [...items, known] : items;
    return createListCollection({ items: all, itemToValue: getItemId, itemToString: getItemLabel });
  }, [items, known, getItemId, getItemLabel]);

  function onScroll(event: UIEvent<HTMLDivElement>) {
    const { scrollTop, scrollHeight, clientHeight } = event.currentTarget;
    if (hasNextPage && !isFetchingNextPage && scrollHeight - scrollTop - clientHeight < LOAD_MARGIN) {
      void fetchNextPage();
    }
  }

  const typed = text.trim().length;
  const tooShort = typed > 0 && typed < minSearchLength;

  return (
    <Field.Root required={required} invalid={invalid}>
      <Combobox.Root
        collection={collection}
        value={value === undefined ? [] : [value]}
        onValueChange={(details) => {
          const id = details.value[0];
          setKnown(details.items[0]);
          onChange(id);
        }}
        // Only typing searches: choosing an item writes its label into the input, which is no search.
        onInputValueChange={(details) => setText(details.reason === "input-change" ? details.inputValue : "")}
        onOpenChange={(details) => setOpen(details.open)}
        openOnClick
        inputBehavior="autohighlight"
        selectionBehavior="replace"
        required={required}
        invalid={invalid}
        positioning={{ sameWidth: true }}
      >
        <Combobox.Label>{label}</Combobox.Label>
        <Combobox.Control>
          <Combobox.Input placeholder={placeholder} />
          <Combobox.IndicatorGroup>
            {!required && <Combobox.ClearTrigger aria-label="Clear value" />}
            <Combobox.Trigger />
          </Combobox.IndicatorGroup>
        </Combobox.Control>
        <Combobox.Positioner>
          <Combobox.Content maxH="300px" overflowY="auto" onScroll={onScroll}>
            {isError ? (
              <ErrorMessage>Could not load the options.</ErrorMessage>
            ) : isLoading ? (
              <Center p="4" role="status" aria-label="Loading">
                <Spinner size="sm" />
              </Center>
            ) : tooShort ? (
              <Text p="2" fontSize="sm" color="fg.muted">
                Type at least {minSearchLength} characters to search
              </Text>
            ) : (
              <Combobox.Empty>No items found</Combobox.Empty>
            )}
            {!isError &&
              !isLoading &&
              items.map((item) => (
                <Combobox.Item item={item} key={getItemId(item)}>
                  <Stack gap="0">
                    <Combobox.ItemText>{getItemLabel(item)}</Combobox.ItemText>
                    {getItemSubtext && (
                      <Text fontSize="xs" color="fg.muted">
                        {getItemSubtext(item)}
                      </Text>
                    )}
                  </Stack>
                  <Combobox.ItemIndicator />
                </Combobox.Item>
              ))}
            {isFetchingNextPage && (
              <Center py="3" role="status" aria-label="Loading more">
                <Spinner size="sm" />
              </Center>
            )}
          </Combobox.Content>
        </Combobox.Positioner>
      </Combobox.Root>
    </Field.Root>
  );
}
