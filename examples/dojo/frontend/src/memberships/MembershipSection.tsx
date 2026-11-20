import { Badge, Button, Flex, Heading, HStack, Stack, Table, Text, VisuallyHidden } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { LuReceipt } from "react-icons/lu";
import { useServerAction } from "@jwcarman/roux-web/api";
import { notify, removal, useConfirm } from "@jwcarman/roux-web/feedback";
import { formatMoney } from "@jwcarman/roux-web/money";
import { pricePerPeriod } from "../plans/plans";
import { formatDate } from "@jwcarman/roux-web/dates";
import type { StudentDetail } from "../students/students";
import {
  membershipsQuery,
  PAYMENT_METHOD_LABELS,
  removePayment,
  type MembershipView,
  type PaymentView,
} from "./memberships";
import { RecordPaymentDialog } from "./RecordPaymentDialog";
import { StartMembershipDialog } from "./StartMembershipDialog";

/** The student's membership: plan, paid through, payments, and the memberships before it. */
export function MembershipSection({ student }: { student: StudentDetail }) {
  const memberships = useQuery(membershipsQuery(student.id));
  const current = memberships.data?.current ?? null;

  return (
    <Stack gap="4">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h3" size="md">
          Membership
        </Heading>
        {memberships.data && (
          <HStack gap="2">
            {current && (
              <RecordPaymentDialog
                student={student}
                current={current}
                trigger={
                  <Button variant="outline">
                    <LuReceipt aria-hidden />
                    Record payment
                  </Button>
                }
              />
            )}
            <StartMembershipDialog
              student={student}
              current={current}
              trigger={<Button variant="outline">Start membership</Button>}
            />
          </HStack>
        )}
      </Flex>
      {memberships.isError && <Text color="fg.error">The membership could not be loaded.</Text>}
      {memberships.data && !current && <Text color="fg.muted">No membership yet.</Text>}
      {current && (
        <>
          <Stack gap="1">
            <Text>{`${current.plan.name} · ${pricePerPeriod(current.plan)}`}</Text>
            <HStack gap="2">
              <Text fontWeight="medium">{`Paid through ${formatDate(current.paidThrough)}`}</Text>
              {current.overdue && <Badge colorPalette="red">Overdue</Badge>}
            </HStack>
            <Text color="fg.muted" fontSize="sm">{`Since ${formatDate(current.startDate)}`}</Text>
          </Stack>
          <Payments student={student} membership={current} label="Payments" />
        </>
      )}
      {(memberships.data?.past ?? []).map((membership) => {
        const title = `${membership.plan.name}, ${formatDate(membership.startDate)} – ${formatDate(membership.endDate)}`;
        return (
          <Stack key={membership.id} gap="2">
            <Heading as="h4" size="sm">
              {title}
            </Heading>
            <Payments student={student} membership={membership} label={`Payments, ${title}`} />
          </Stack>
        );
      })}
    </Stack>
  );
}

function Payments({ student, membership, label }: { student: StudentDetail; membership: MembershipView; label: string }) {
  if (membership.payments.length === 0) {
    return <Text color="fg.muted">No payments yet.</Text>;
  }
  return (
    <Table.Root aria-label={label} size="sm">
      <Table.Header>
        <Table.Row>
          <Table.ColumnHeader>Taken on</Table.ColumnHeader>
          <Table.ColumnHeader>{membership.plan.period === "YEARLY" ? "Years" : "Months"}</Table.ColumnHeader>
          <Table.ColumnHeader textAlign="end">Amount</Table.ColumnHeader>
          <Table.ColumnHeader>Method</Table.ColumnHeader>
          <Table.ColumnHeader>Recorded by</Table.ColumnHeader>
          <Table.ColumnHeader>
            <VisuallyHidden>Actions</VisuallyHidden>
          </Table.ColumnHeader>
        </Table.Row>
      </Table.Header>
      <Table.Body>
        {membership.payments.map((payment) => (
          <Table.Row key={payment.id}>
            <Table.Cell>{formatDate(payment.takenOn)}</Table.Cell>
            <Table.Cell>{payment.periods}</Table.Cell>
            <Table.Cell textAlign="end">{formatMoney(payment.amount)}</Table.Cell>
            <Table.Cell>
              {PAYMENT_METHOD_LABELS[payment.method]}
              {payment.note && (
                <Text as="span" color="fg.muted">{` · ${payment.note}`}</Text>
              )}
            </Table.Cell>
            <Table.Cell>{payment.recordedByName}</Table.Cell>
            <Table.Cell textAlign="end">
              <RemovePaymentButton studentId={student.id} payment={payment} />
            </Table.Cell>
          </Table.Row>
        ))}
      </Table.Body>
    </Table.Root>
  );
}

function RemovePaymentButton({ studentId, payment }: { studentId: string; payment: PaymentView }) {
  const confirm = useConfirm();
  const taken = formatDate(payment.takenOn);
  const { run, pending } = useServerAction(removePayment(studentId), {
    failure: "Could not remove the payment",
    onSuccess: () => notify.success("The payment was removed"),
  });

  async function onRemove() {
    const message = `The ${formatMoney(payment.amount)} taken on ${taken} will be removed, and paid through moves back.`;
    if (await confirm(removal("Remove this payment?", message))) {
      await run(payment.id);
    }
  }

  return (
    <Button
      size="sm"
      variant="outline"
      colorPalette="red"
      loading={pending}
      aria-label={`Remove the payment of ${taken}`}
      onClick={onRemove}
    >
      Remove
    </Button>
  );
}
