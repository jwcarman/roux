import { Button, HStack, IconButton } from "@chakra-ui/react";
import { LuArrowDown, LuArrowUp } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { RankFormDialog } from "./RankFormDialog";
import { moveRankDown, moveRankUp, removeRank, type Rank } from "./ranks";

/** Edit, move and remove for one rank; `first` and `last` say where it sits in the ladder. */
export function RankActions({ rank, first, last }: { rank: Rank; first: boolean; last: boolean }) {
  const confirm = useConfirm();
  const up = useServerAction(moveRankUp, { failure: `Could not move ${rank.name}` });
  const down = useServerAction(moveRankDown, { failure: `Could not move ${rank.name}` });
  const remove = useServerAction(removeRank, {
    failure: `Could not remove ${rank.name}`,
    onSuccess: () => notify.success(`${rank.name} was removed`),
  });

  async function onRemove() {
    if (await confirm(removal(`Remove ${rank.name}?`, "It will be removed from the ladder."))) {
      await remove.run(rank.id);
    }
  }

  return (
    <HStack gap="2" justify="flex-end">
      <IconButton
        aria-label={`Move ${rank.name} up`}
        size="sm"
        variant="ghost"
        disabled={last}
        loading={up.pending}
        onClick={() => void up.run(rank.id)}
      >
        <LuArrowUp />
      </IconButton>
      <IconButton
        aria-label={`Move ${rank.name} down`}
        size="sm"
        variant="ghost"
        disabled={first}
        loading={down.pending}
        onClick={() => void down.run(rank.id)}
      >
        <LuArrowDown />
      </IconButton>
      <RankFormDialog
        rank={rank}
        trigger={
          <Button size="sm" variant="outline">
            Edit
          </Button>
        }
      />
      <Button size="sm" variant="outline" colorPalette="red" loading={remove.pending} onClick={onRemove}>
        Remove
      </Button>
    </HStack>
  );
}
