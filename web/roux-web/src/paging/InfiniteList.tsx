import { Box, Button, Center, Spinner, Stack, Text, type BoxProps } from "@chakra-ui/react";
import { useInfiniteQuery } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, type ReactNode } from "react";
import { ErrorMessage } from "../feedback/ErrorMessage";
import { nextPageIndex, type PageDto, type PageQuery } from "./paging";

/** When an {@link InfiniteList} loads its next page. */
export type LoadMode = "manual" | "auto" | "hybrid";

/** What {@link InfiniteList} takes. */
export interface InfiniteListProps<T> {
  /** The list's accessible name. */
  "aria-label": string;
  /** The list's query, from its resource module; the list asks it for one page at a time, under the key plus `"infinite"`. */
  query: PageQuery<T>;
  /** A stable key per item, such as its id. */
  getItemKey: (item: T) => string;
  renderItem: (item: T, index: number) => ReactNode;
  /**
   * `manual` loads more with a button; `auto` when the end scrolls into view; `hybrid` both.
   * Where the browser cannot observe scrolling, the button is shown in every mode.
   */
  loadMode?: LoadMode;
  /** How near the end, in pixels, `auto` starts loading. */
  threshold?: number;
  loadMoreText?: string;
  emptyText?: string;
  errorText?: string;
  containerProps?: BoxProps;
}

/** A list that grows a page at a time from a jpa-utils paged endpoint. */
export function InfiniteList<T>({
  "aria-label": label,
  query,
  getItemKey,
  renderItem,
  loadMode = "manual",
  threshold = 100,
  loadMoreText = "Load more",
  emptyText = "Nothing to show.",
  errorText = "Could not load the list.",
  containerProps,
}: InfiniteListProps<T>) {
  const sentinel = useRef<HTMLDivElement>(null);
  const canObserve = typeof IntersectionObserver !== "undefined";
  const observes = canObserve && loadMode !== "manual";
  const showsButton = !observes || loadMode === "hybrid";

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading, isError } = useInfiniteQuery({
    queryKey: [...query.queryKey, "infinite"],
    queryFn: ({ pageParam, signal }) => query.fetch({ pageIndex: pageParam }, signal),
    initialPageParam: 0,
    getNextPageParam: (lastPage: PageDto<T>) => nextPageIndex(lastPage),
  });

  const items = useMemo(() => data?.pages.flatMap((page) => page.data) ?? [], [data]);

  useEffect(() => {
    const element = sentinel.current;
    if (!observes || !element) {
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry?.isIntersecting && hasNextPage && !isFetchingNextPage) {
          void fetchNextPage();
        }
      },
      { rootMargin: `${threshold}px` },
    );
    observer.observe(element);
    return () => observer.disconnect();
  }, [observes, threshold, hasNextPage, isFetchingNextPage, fetchNextPage]);

  if (isError) {
    return <ErrorMessage>{errorText}</ErrorMessage>;
  }
  if (isLoading) {
    return (
      <Center py="8" role="status" aria-label="Loading">
        <Spinner size="lg" />
      </Center>
    );
  }
  if (items.length === 0) {
    return (
      <Center py="8">
        <Text color="fg.muted">{emptyText}</Text>
      </Center>
    );
  }

  return (
    <Box {...containerProps}>
      <Stack as="ul" aria-label={label} gap="0" listStyleType="none" margin="0" padding="0">
        {items.map((item, index) => (
          <Box
            as="li"
            key={getItemKey(item)}
            borderWidth="1px"
            borderTopWidth={index === 0 ? undefined : "0"}
            _hover={{ bg: "bg.muted" }}
          >
            {renderItem(item, index)}
          </Box>
        ))}
      </Stack>
      {observes && hasNextPage && <div ref={sentinel} style={{ height: "1px" }} />}
      {isFetchingNextPage && (
        <Center py="4" role="status" aria-label="Loading more">
          <Spinner size="md" />
        </Center>
      )}
      {showsButton && hasNextPage && !isFetchingNextPage && (
        <Center py="4">
          <Button variant="outline" onClick={() => void fetchNextPage()}>
            {loadMoreText}
          </Button>
        </Center>
      )}
    </Box>
  );
}
