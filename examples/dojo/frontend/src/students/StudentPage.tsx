import { Badge, Button, DataList, Flex, Heading, HStack, Link, Stack, Table, Text, VisuallyHidden } from "@chakra-ui/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { LuArrowLeft, LuAward } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { PROMOTIONS_MANAGE, STUDENTS_MANAGE } from "../api";
import { RankSwatch } from "../ranks/RankSwatch";
import { formatDate } from "../shell/format";
import { useSession } from "../shell/session";
import { DANGER_PALETTE } from "../shell/theme";
import { PromoteDialog } from "./PromoteDialog";
import { StudentActions } from "./StudentActions";
import { removePromotion, studentQuery, type Promotion, type StudentDetail } from "./students";

const route = getRouteApi("/_signedIn/students/$studentId");

/** /students/$studentId: the loader has fetched the student, so this renders with data at once. */
export function StudentPage() {
  const { studentId } = route.useParams();
  const { data: student } = useSuspenseQuery(studentQuery(studentId));
  const { me } = useSession();
  const name = `${student.firstName} ${student.lastName}`;
  const manages = me?.permissions.includes(STUDENTS_MANAGE) ?? false;
  const promotes = me?.permissions.includes(PROMOTIONS_MANAGE) ?? false;

  return (
    <Stack gap="6">
      <Link asChild alignSelf="start" fontSize="sm">
        <RouterLink to="/students">
          <LuArrowLeft aria-hidden />
          All students
        </RouterLink>
      </Link>
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">{name}</Heading>
        {manages && <StudentActions student={student} />}
      </Flex>
      <DataList.Root orientation="horizontal">
        <DataList.Item>
          <DataList.ItemLabel>Current rank</DataList.ItemLabel>
          <DataList.ItemValue>
            {student.currentRank ? (
              <Badge size="lg" gap="2">
                <RankSwatch colour={student.currentRank.colour} />
                {student.currentRank.name}
              </Badge>
            ) : (
              "Not promoted yet"
            )}
          </DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Status</DataList.ItemLabel>
          <DataList.ItemValue>
            <Badge colorPalette={student.status === "ACTIVE" ? undefined : DANGER_PALETTE}>
              {student.status === "ACTIVE" ? "Active" : "Inactive"}
            </Badge>
          </DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Email</DataList.ItemLabel>
          <DataList.ItemValue>{student.email ?? "—"}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Phone</DataList.ItemLabel>
          <DataList.ItemValue>{student.phone ?? "—"}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Date of birth</DataList.ItemLabel>
          <DataList.ItemValue>{student.birthDate ? formatDate(student.birthDate) : "—"}</DataList.ItemValue>
        </DataList.Item>
        <DataList.Item>
          <DataList.ItemLabel>Started</DataList.ItemLabel>
          <DataList.ItemValue>{formatDate(student.startDate)}</DataList.ItemValue>
        </DataList.Item>
      </DataList.Root>
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h3" size="md">
          Promotions
        </Heading>
        {promotes && (
          <PromoteDialog
            student={student}
            trigger={
              <Button variant="outline">
                <LuAward aria-hidden />
                Promote
              </Button>
            }
          />
        )}
      </Flex>
      <PromotionHistory student={student} canRemove={promotes} />
    </Stack>
  );
}

/** The student's promotions, newest first; whoever manages promotions can take one back. */
function PromotionHistory({ student, canRemove }: { student: StudentDetail; canRemove: boolean }) {
  if (student.promotions.length === 0) {
    return <Text color="fg.muted">No promotions yet.</Text>;
  }
  return (
    <Table.Root aria-label="Promotions">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Date</Table.ColumnHeader>
          <Table.ColumnHeader>Rank</Table.ColumnHeader>
          {canRemove && (
            <Table.ColumnHeader>
              <VisuallyHidden>Actions</VisuallyHidden>
            </Table.ColumnHeader>
          )}
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {student.promotions.map((promotion) => (
          <Table.Row key={promotion.id}>
            <Table.Cell>{formatDate(promotion.date)}</Table.Cell>
            <Table.Cell>
              <HStack gap="2">
                <RankSwatch colour={promotion.rank.colour} />
                <Text>{promotion.rank.name}</Text>
              </HStack>
            </Table.Cell>
            {canRemove && (
              <Table.Cell textAlign="end">
                <RemovePromotionButton student={student} promotion={promotion} />
              </Table.Cell>
            )}
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function RemovePromotionButton({ student, promotion }: { student: StudentDetail; promotion: Promotion }) {
  const confirm = useConfirm();
  const name = `${student.firstName} ${student.lastName}`;
  const { run, pending } = useServerAction(removePromotion(student.id), {
    failure: `Could not remove the promotion of ${name}`,
    onSuccess: () => notify.success(`The promotion to ${promotion.rank.name} was removed`),
  });

  async function onRemove() {
    const message = `${name} will no longer have been promoted to ${promotion.rank.name} on ${formatDate(promotion.date)}.`;
    if (await confirm(removal(`Remove the promotion to ${promotion.rank.name}?`, message))) {
      await run(promotion.id);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      colorPalette={DANGER_PALETTE}
      loading={pending}
      aria-label={`Remove the promotion to ${promotion.rank.name} on ${formatDate(promotion.date)}`}
      onClick={onRemove}
    >
      Remove
    </Button>
  );
}
