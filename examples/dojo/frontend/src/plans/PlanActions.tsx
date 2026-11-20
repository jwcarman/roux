import { Button, HStack } from "@chakra-ui/react";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import type { MoneySettings } from "@jwcarman/roux-web/money";
import { PlanFormDialog } from "./PlanFormDialog";
import { removePlan, type Plan } from "./plans";

/** Edit for one plan, and Remove while no membership has used it. */
export function PlanActions({ plan, settings }: { plan: Plan; settings: MoneySettings }) {
  const confirm = useConfirm();
  const remove = useServerAction(removePlan, {
    failure: `Could not remove ${plan.name}`,
    onSuccess: () => notify.success(`${plan.name} was removed`),
  });

  async function onRemove() {
    if (await confirm(removal(`Remove ${plan.name}?`, "It will no longer be offered."))) {
      await remove.run(plan.id);
    }
  }

  return (
    <HStack gap="2" justify="flex-end">
      <PlanFormDialog
        plan={plan}
        settings={settings}
        trigger={
          <Button size="sm" variant="outline">
            Edit
          </Button>
        }
      />
      {!plan.inUse && (
        <Button size="sm" variant="outline" colorPalette="red" loading={remove.pending} onClick={onRemove}>
          Remove
        </Button>
      )}
    </HStack>
  );
}
