import { Box, Button, Card, Flex, HStack, Heading, SimpleGrid, Stack, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { LuListChecks } from "react-icons/lu";
import { ErrorMessage } from "@jwcarman/roux-web/feedback";
import { ATTENDANCE_RECORD, CLASSES_MANAGE } from "../permissions.gen";
import { formatTime } from "../shell/format";
import { useSession } from "../shell/session";
import { ClassActions } from "./ClassActions";
import { ClassFormDialog } from "./ClassFormDialog";
import { classesQuery, WEEKDAYS, WEEKDAY_LABELS, type SchoolClass } from "./classes";

/** The school's week, one column per day (Monday first); the owner adds, edits and removes classes. */
export function TimetablePage() {
  const { me } = useSession();
  const manages = me?.permissions.includes(CLASSES_MANAGE) ?? false;
  const checksIn = me?.permissions.includes(ATTENDANCE_RECORD) ?? false;
  const classes = useQuery(classesQuery);

  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Timetable</Heading>
        {manages && <ClassFormDialog trigger={<Button>New class</Button>} />}
      </Flex>
      {classes.isError && <ErrorMessage>The timetable could not be loaded.</ErrorMessage>}
      <SimpleGrid columns={{ base: 1, md: 4, xl: 7 }} gap="4" aria-label="Timetable">
        {WEEKDAYS.map((weekday) => (
          <Box key={weekday} as="section" aria-labelledby={`day-${weekday}`}>
            <Heading as="h3" size="sm" id={`day-${weekday}`} mb="2">
              {WEEKDAY_LABELS[weekday]}
            </Heading>
            <Stack gap="2">
              {(classes.data ?? [])
                .filter((schoolClass) => schoolClass.weekday === weekday)
                .map((schoolClass) => (
                  <ClassCard key={schoolClass.id} schoolClass={schoolClass} manages={manages} checksIn={checksIn} />
                ))}
            </Stack>
          </Box>
        ))}
      </SimpleGrid>
      {classes.isSuccess && classes.data.length === 0 && <Text color="fg.muted">No classes yet.</Text>}
    </Stack>
  );
}

function ClassCard({ schoolClass, manages, checksIn }: { schoolClass: SchoolClass; manages: boolean; checksIn: boolean }) {
  return (
    <Card.Root size="sm" variant="outline">
      <Card.Body gap="1">
        <Text fontWeight="semibold">{schoolClass.name}</Text>
        <Text fontSize="sm">
          {formatTime(schoolClass.startsAt)} – {formatTime(schoolClass.endsAt)}
        </Text>
        {schoolClass.instructorName && (
          <Text fontSize="sm" color="fg.muted">
            {schoolClass.instructorName}
          </Text>
        )}
      </Card.Body>
      {(manages || checksIn) && (
        <Card.Footer>
          <HStack gap="2" wrap="wrap">
            {checksIn && (
              <Button asChild size="xs" aria-label={`Check in ${schoolClass.name}`}>
                <RouterLink to="/classes/$classId/check-in" params={{ classId: schoolClass.id }}>
                  <LuListChecks aria-hidden />
                  Check in
                </RouterLink>
              </Button>
            )}
            {manages && <ClassActions schoolClass={schoolClass} />}
          </HStack>
        </Card.Footer>
      )}
    </Card.Root>
  );
}
