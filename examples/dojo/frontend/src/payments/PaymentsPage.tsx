import { Heading, Link, Stack, Table, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { formatMoney } from "@jwcarman/roux-web/money";
import { QueryTable } from "@jwcarman/roux-web/table";
import { PAYMENT_METHOD_LABELS } from "../memberships/memberships";
import { formatDate } from "@jwcarman/roux-web/dates";
import { formatMonth, monthlyTotalsQuery, thisMonthsPayments, type PaymentListEntry } from "./payments";

const column = createColumnHelper<PaymentListEntry>();

const COLUMNS: ColumnDef<PaymentListEntry, unknown>[] = [
  column.accessor("takenOn", { header: "Taken on", enableSorting: false, cell: (info) => formatDate(info.getValue()) }),
  column.accessor("studentName", {
    header: "Student",
    enableSorting: false,
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/students/$studentId" params={{ studentId: info.row.original.studentId }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor("planName", { header: "Plan", enableSorting: false }),
  column.accessor("periods", { header: "Periods", enableSorting: false }),
  column.accessor("amount", {
    header: () => <Text textAlign="end">Amount</Text>,
    enableSorting: false,
    cell: (info) => <Text textAlign="end">{formatMoney(info.row.original.amount)}</Text>,
  }),
  column.accessor("method", {
    header: "Method",
    enableSorting: false,
    cell: (info) => PAYMENT_METHOD_LABELS[info.row.original.method],
  }),
  column.accessor("recordedByName", { header: "Recorded by", enableSorting: false }),
];

/** Money taken: each of the last twelve months, and this month's payments. */
export function PaymentsPage() {
  return (
    <Stack gap="8">
      <Heading as="h2">Payments</Heading>
      <MonthlyTotals />
      <Stack gap="3">
        <Heading as="h3" size="md">
          This month
        </Heading>
        <QueryTable
          aria-label="This month's payments"
          query={thisMonthsPayments}
          columns={COLUMNS}
          getRowId={(payment) => payment.id}
          emptyText="No payments this month yet."
          errorText="The payments could not be loaded."
        />
      </Stack>
    </Stack>
  );
}

function MonthlyTotals() {
  const totals = useQuery(monthlyTotalsQuery);
  return (
    <Stack gap="3">
      <Heading as="h3" size="md">
        By month
      </Heading>
      {totals.isError && <Text color="fg.error">The monthly totals could not be loaded.</Text>}
      {totals.data && (
        <Table.Root aria-label="Money taken by month" size="sm" maxW="sm">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Month</Table.ColumnHeader>
              <Table.ColumnHeader textAlign="end">Taken</Table.ColumnHeader>
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {[...totals.data].reverse().map((month) => (
              <Table.Row key={month.month}>
                <Table.Cell>{formatMonth(month.month)}</Table.Cell>
                <Table.Cell textAlign="end">{formatMoney(month.total)}</Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Stack>
  );
}
