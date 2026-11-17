import { Button, Text } from "@chakra-ui/react";
import { useRef } from "react";
import { LuCheck } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { markAttendance, usePendingPresence, type Attendee } from "./attendance";

/**
 * One student's big toggle: tap for present, tap again to undo. It changes at once; the server's
 * answer (and the refreshed list) has the last word.
 */
export function AttendeeToggle({ classId, date, attendee }: { classId: string; date: string; attendee: Attendee }) {
  const name = `${attendee.firstName} ${attendee.lastName}`;
  const { run } = useServerAction(markAttendance(classId, date, attendee.studentId), {
    failure: `Could not mark ${name}`,
  });
  const present = usePendingPresence(classId, date, attendee.studentId) ?? attendee.present;
  /**
   * What the last tap still waiting for its answer asked for. A second tap in the same instant
   * (a double tap) is handled before React has shown the first one, so it must not read `present`:
   * it would ask for the same thing twice.
   */
  const asked = useRef<{ present: boolean; waiting: number } | null>(null);

  async function onTap() {
    const next = !(asked.current?.present ?? present);
    asked.current = { present: next, waiting: (asked.current?.waiting ?? 0) + 1 };
    await run(next);
    const current = asked.current;
    if (current !== null) {
      current.waiting -= 1;
      if (current.waiting === 0) {
        asked.current = null;
      }
    }
  }

  return (
    <Button
      size="xl"
      width="full"
      justifyContent="space-between"
      variant={present ? "solid" : "outline"}
      aria-pressed={present}
      onClick={() => void onTap()}
    >
      <Text>{name}</Text>
      {present && <LuCheck aria-hidden />}
    </Button>
  );
}
