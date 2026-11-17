import { Flex, Heading, HStack, Input, Link, Stack, Text, Field } from "@chakra-ui/react";
import { useSuspenseQuery, useQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowLeft } from "react-icons/lu";
import { ApiError } from "@jwcarman/roux-web/api";
import { ErrorMessage } from "@jwcarman/roux-web/feedback";
import { fieldErrorsOf } from "@jwcarman/roux-web/form";
import { SearchInput } from "@jwcarman/roux-web/table";
import { classQuery, WEEKDAY_LABELS } from "../classes/classes";
import { todayIso } from "../shell/dates";
import { formatTime } from "../shell/format";
import { checkInQuery, type Attendee } from "./attendance";
import { AttendeeToggle } from "./AttendeeToggle";

const route = getRouteApi("/_signedIn/classes/$classId/check-in");

/** Whether `attendee`'s name holds every word of `term`, ignoring case. */
function matches(attendee: Attendee, term: string): boolean {
  const name = `${attendee.firstName} ${attendee.lastName}`.toLowerCase();
  return term
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word !== "")
    .every((word) => name.includes(word));
}

/** /classes/$classId/check-in: every active student as a toggle for a date (today unless changed). */
export function CheckInPage() {
  const { classId } = route.useParams();
  const { date: searched } = route.useSearch();
  const navigate = route.useNavigate();
  const date = searched ?? todayIso();
  const { data: schoolClass } = useSuspenseQuery(classQuery(classId));
  const list = useQuery(checkInQuery(classId, date));
  const [term, setTerm] = useState("");

  const everyone = list.data ?? [];
  const shown = everyone.filter((attendee) => matches(attendee, term));
  const present = everyone.filter((attendee) => attendee.present).length;
  const dateError = list.error instanceof ApiError ? fieldErrorsOf(list.error.problem).date : undefined;

  return (
    <Stack gap="6">
      <Link asChild alignSelf="start" fontSize="sm">
        <RouterLink to="/timetable">
          <LuArrowLeft aria-hidden />
          Timetable
        </RouterLink>
      </Link>
      <Stack gap="1">
        <Heading as="h2">Check in: {schoolClass.name}</Heading>
        <Text color="fg.muted">
          {WEEKDAY_LABELS[schoolClass.weekday]}s, {formatTime(schoolClass.startsAt)} – {formatTime(schoolClass.endsAt)}
        </Text>
      </Stack>
      <Flex gap="4" wrap="wrap" align="flex-start">
        <Field.Root width="auto" invalid={dateError !== undefined}>
          <Field.Label>Date</Field.Label>
          <Input
            type="date"
            value={date}
            onChange={(event) => {
              void navigate({ search: { date: event.target.value || undefined }, replace: true });
            }}
          />
        </Field.Root>
        <SearchInput label="Search students" placeholder="Search students" value={term} onChange={setTerm} width="xs" />
      </Flex>
      {dateError && <ErrorMessage>{dateError}</ErrorMessage>}
      {list.isError && dateError === undefined && <ErrorMessage>The students could not be loaded.</ErrorMessage>}
      {list.isSuccess && (
        <HStack justify="space-between">
          <Text role="status">
            {present} of {everyone.length} present
          </Text>
        </HStack>
      )}
      <Stack gap="2">
        {shown.map((attendee) => (
          <AttendeeToggle key={attendee.studentId} classId={classId} date={date} attendee={attendee} />
        ))}
      </Stack>
      {list.isSuccess && everyone.length === 0 && <Text color="fg.muted">No active students.</Text>}
      {list.isSuccess && everyone.length > 0 && shown.length === 0 && (
        <Text color="fg.muted">No student matches “{term.trim()}”.</Text>
      )}
    </Stack>
  );
}
