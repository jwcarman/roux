import { Button, Text } from "@chakra-ui/react";
import { LuCheck } from "react-icons/lu";
import { useOptimisticToggle } from "@jwcarman/roux-web/api";
import { markAttendance, type Attendee } from "./attendance";

/**
 * One student's big toggle: tap for present, tap again to undo. It changes at once; the server's
 * answer (and the refreshed list) has the last word.
 */
export function AttendeeToggle({ classId, date, attendee }: { classId: string; date: string; attendee: Attendee }) {
  const name = `${attendee.firstName} ${attendee.lastName}`;
  const [present, toggle] = useOptimisticToggle(markAttendance(classId, date, attendee.studentId), attendee.present, {
    failure: `Could not mark ${name}`,
  });

  return (
    <Button
      size="xl"
      width="full"
      justifyContent="space-between"
      variant={present ? "solid" : "outline"}
      aria-pressed={present}
      onClick={() => void toggle()}
    >
      <Text>{name}</Text>
      {present && <LuCheck aria-hidden />}
    </Button>
  );
}
