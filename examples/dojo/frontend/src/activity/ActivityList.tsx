import { Box, Stack, Text } from "@chakra-ui/react";
import type { QueryKey } from "@tanstack/react-query";
import type { Activity } from "../api";
import { InfiniteList, type PageDto } from "@jwcarman/roux-web/paging";
import { relativeTime } from "./relativeTime";

export interface ActivityListProps {
  "aria-label": string;
  queryKey: QueryKey;
  fetchPage: (pageIndex: number) => Promise<PageDto<Activity>>;
  /** The time "3 days ago" counts from; the current time unless a test fixes it. */
  now?: Date;
}

/** A record's history, newest first, a page at a time: what changed, who changed it, and when. */
export function ActivityList({ "aria-label": label, queryKey, fetchPage, now }: ActivityListProps) {
  return (
    <InfiniteList
      aria-label={label}
      queryKey={queryKey}
      fetchPage={fetchPage}
      getItemKey={(entry) => entry.id}
      emptyText="Nothing has happened yet."
      errorText="Could not load the history."
      renderItem={(entry) => (
        <Box px="4" py="3">
          <Text>{entry.summary}</Text>
          <Stack direction="row" gap="1" fontSize="sm" color="fg.muted">
            <Text as="span">by {entry.actorName} ·</Text>
            <time dateTime={entry.occurredAt} title={new Date(entry.occurredAt).toLocaleString()}>
              {relativeTime(new Date(entry.occurredAt), now)}
            </time>
          </Stack>
        </Box>
      )}
    />
  );
}
