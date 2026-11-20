import {
  Badge,
  Button,
  DataList,
  Flex,
  Heading,
  Stack,
} from "@chakra-ui/react";
import { LuUserCheck, LuUserX } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, useConfirm } from "@jwcarman/roux-web/feedback";
import type { MemberDetail } from "../api";
import { ActivityList } from "@jwcarman/roux-web/activity";
import {
  activitiesPage,
  changeMemberStatus,
  ROLE_LABELS,
  type MemberStatusAction,
} from "./members";
import { formatDateTime } from "@jwcarman/roux-web/dates";

export interface MemberDetailViewProps {
  member: MemberDetail;
  /** Whether the viewer holds users.manage. */
  canManage: boolean;
  /** Whether this is the viewer's own page (they cannot deactivate themselves). */
  isSelf: boolean;
}

interface StatusChange {
  action: MemberStatusAction;
  /** The toast once it is done. */
  done: string;
}

/** A member: who they are, Deactivate or Reactivate for a manager, and their history. */
export function MemberDetailView({
  member,
  canManage,
  isSelf,
}: MemberDetailViewProps) {
  const confirm = useConfirm();
  const active = member.status === "ACTIVE";
  const { run, pending: busy } = useServerAction<MemberDetail, StatusChange>(
    changeMemberStatus(member.id),
    {
      failure: ({ action }) => `Could not ${action} ${member.displayName}`,
      onSuccess: (_, { done }) => notify.success(done),
    },
  );
  const change = (action: StatusChange["action"], done: string) =>
    run({ action, done });

  async function onDeactivate() {
    const confirmed = await confirm({
      title: `Deactivate ${member.displayName}?`,
      message: "They won't be able to sign in.",
      confirmLabel: "Deactivate",
      destructive: true,
    });
    if (confirmed) {
      await change("deactivate", `${member.displayName} was deactivated`);
    }
  }

  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">{member.displayName}</Heading>
        {canManage && !isSelf && active && (
          <Button
            variant="outline"
            colorPalette="red"
            loading={busy}
            onClick={onDeactivate}
          >
            <LuUserX aria-hidden />
            Deactivate
          </Button>
        )}
        {canManage && !active && (
          <Button
            variant="outline"
            loading={busy}
            onClick={() =>
              change("reactivate", `${member.displayName} was reactivated`)
            }
          >
            <LuUserCheck aria-hidden />
            Reactivate
          </Button>
        )}
      </Flex>
      <DataList.Root orientation="horizontal">
        <DataList.Item>
          <DataList.ItemLabel>Email</DataList.ItemLabel>
          <DataList.ItemValue>{member.email}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Role</DataList.ItemLabel>
          <DataList.ItemValue>{ROLE_LABELS[member.role]}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Status</DataList.ItemLabel>
          <DataList.ItemValue>
            <Badge colorPalette={active ? undefined : "red"}>
              {active ? "Active" : "Deactivated"}
            </Badge>
          </DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Joined</DataList.ItemLabel>
          <DataList.ItemValue>
            <time dateTime={member.joinedAt}>
              {formatDateTime(member.joinedAt)}
            </time>
          </DataList.ItemValue>
        </DataList.Item>
      </DataList.Root>
      <Heading as="h3" size="md">
        History
      </Heading>
      <ActivityList aria-label="History" query={activitiesPage(member.id)} />
    </Stack>
  );
}
