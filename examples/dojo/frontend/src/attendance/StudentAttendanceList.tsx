import { DataList, Heading, HStack, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { InfiniteList } from "@jwcarman/roux-web/paging";
import { formatDate } from "@jwcarman/roux-web/dates";
import { attendancePage, sincePromotionQuery } from "./attendance";

/** "Classes since last promotion", as one more line of a student's details. */
export function ClassesSincePromotion({ studentId }: { studentId: string }) {
  const since = useQuery(sincePromotionQuery(studentId));
  const classes = since.data?.classes;
  const never = since.data !== undefined && since.data.promotedOn === null;

  return (
    <DataList.Item>
      <DataList.ItemLabel>Classes since last promotion</DataList.ItemLabel>
      <DataList.ItemValue>
        {since.isError && "—"}
        {classes !== undefined && (never ? `${classes} (all, not promoted yet)` : classes)}
      </DataList.ItemValue>
    </DataList.Item>
  );
}

/** The classes a student attended, newest first, a page at a time. */
export function StudentAttendanceList({ studentId }: { studentId: string }) {
  return (
    <Stack gap="3">
      <Heading as="h3" size="md">
        Attendance
      </Heading>
      <InfiniteList
        aria-label="Attendance"
        query={attendancePage(studentId)}
        getItemKey={(attendance) => attendance.id}
        loadMode="hybrid"
        loadMoreText="Show earlier classes"
        emptyText="No classes attended yet."
        errorText="The attendance could not be loaded."
        renderItem={(attendance) => (
          <HStack px="4" py="3" justify="space-between">
            <Text>{attendance.className}</Text>
            <Text color="fg.muted">{formatDate(attendance.date)}</Text>
          </HStack>
        )}
      />
    </Stack>
  );
}
