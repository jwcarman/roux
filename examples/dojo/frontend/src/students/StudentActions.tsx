import { Button, HStack } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, useConfirm } from "@jwcarman/roux-web/feedback";
import { StudentDialog } from "./StudentDialog";
import { changeStudentStatus, type Student, type StudentDetail, type StudentStatusAction } from "./students";

interface StatusChange {
  action: StudentStatusAction;
  /** The toast once it is done. */
  done: string;
}

/** Edit, and Deactivate or Reactivate, for one student of the list. */
export function StudentActions({ student }: { student: Student }) {
  const confirm = useConfirm();
  const name = `${student.firstName} ${student.lastName}`;
  const active = student.status === "ACTIVE";
  const { run, pending } = useServerAction<StudentDetail, StatusChange>(changeStudentStatus(student.id), {
    failure: ({ action }) => `Could not ${action} ${name}`,
    onSuccess: (_, { done }) => notify.success(done),
  });

  async function onDeactivate() {
    const confirmed = await confirm({
      title: `Deactivate ${name}?`,
      message: "They leave the active list. Their promotions are kept.",
      confirmLabel: "Deactivate",
      destructive: true,
    });
    if (confirmed) {
      await run({ action: "deactivate", done: `${name} was deactivated` });
    }
  }

  return (
    <HStack gap="2" justify="flex-end">
      <StudentDialog
        student={student}
        trigger={
          <Button size="sm" variant="outline" aria-label={`Edit ${name}`}>
            Edit
          </Button>
        }
      />
      {active ? (
        <Button
          size="sm"
          variant="outline"
          colorPalette="red"
          loading={pending}
          aria-label={`Deactivate ${name}`}
          onClick={onDeactivate}
        >
          Deactivate
        </Button>
      ) : (
        <Button
          size="sm"
          variant="outline"
          loading={pending}
          aria-label={`Reactivate ${name}`}
          onClick={() => run({ action: "reactivate", done: `${name} was reactivated` })}
        >
          Reactivate
        </Button>
      )}
    </HStack>
  );
}
