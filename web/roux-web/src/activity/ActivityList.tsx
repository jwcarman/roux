import { Box, Stack, Text } from "@chakra-ui/react";
import { formatDateTime } from "../dates/format";
import { formatRelativeTime } from "../dates/relative";
import { InfiniteList } from "../paging/InfiniteList";
import type { PageQuery } from "../paging/paging";
import type { Activity } from "./Activity";

export interface ActivityListProps {
  "aria-label": string;
  /** The history's query, from its resource module (`pageQuery(keys.activities(id), ...)`). */
  query: PageQuery<Activity>;
  /** What it says with no history; "Nothing has happened yet." unless given. */
  emptyText?: string;
  /** The time "3 days ago" counts from; this device's time unless a test fixes it. */
  now?: Date;
}

/** A record's history, newest first, a page at a time: what happened, who did it, and when. */
export function ActivityList({
  "aria-label": label,
  query,
  emptyText = "Nothing has happened yet.",
  now,
}: Readonly<ActivityListProps>) {
  return (
    <InfiniteList
      aria-label={label}
      query={query}
      getItemKey={(entry) => entry.id}
      emptyText={emptyText}
      errorText="Could not load the history."
      renderItem={(entry) => (
        <Box px="4" py="3">
          <Text>{entry.description}</Text>
          <Stack direction="row" gap="1" fontSize="sm" color="fg.muted">
            <Text as="span">by {entry.actorName} ·</Text>
            <time dateTime={entry.occurredAt} title={formatDateTime(entry.occurredAt)}>
              {formatRelativeTime(entry.occurredAt, now)}
            </time>
          </Stack>
        </Box>
      )}
    />
  );
}
