import { Button, HStack } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { ClassFormDialog } from "./ClassFormDialog";
import { removeClass, type SchoolClass } from "./classes";

/** Edit and Remove for one class of the timetable. */
export function ClassActions({ schoolClass }: { schoolClass: SchoolClass }) {
  const confirm = useConfirm();
  const remove = useServerAction(removeClass, {
    failure: `Could not remove ${schoolClass.name}`,
    onSuccess: () => notify.success(`${schoolClass.name} was removed`),
  });

  async function onRemove() {
    if (await confirm(removal(`Remove ${schoolClass.name}?`, "It will be removed from the timetable."))) {
      await remove.run(schoolClass.id);
    }
  }

  return (
    <HStack gap="2">
      <ClassFormDialog
        schoolClass={schoolClass}
        trigger={
          <Button size="xs" variant="outline" aria-label={`Edit ${schoolClass.name}`}>
            Edit
          </Button>
        }
      />
      <Button
        size="xs"
        variant="outline"
        colorPalette="red"
        loading={remove.pending}
        aria-label={`Remove ${schoolClass.name}`}
        onClick={onRemove}
      >
        Remove
      </Button>
    </HStack>
  );
}
