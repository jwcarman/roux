import { Badge, Button, Flex, HStack, Heading, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { useMemo } from "react";
import { moneySettingsQuery, type MoneySettings } from "@jwcarman/roux-web/money";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { PlanActions } from "./PlanActions";
import { PlanFormDialog } from "./PlanFormDialog";
import { plansQuery, pricePerPeriod, type Plan } from "./plans";

const column = createColumnHelper<Plan>();

function columnsFor(settings: MoneySettings): ColumnDef<Plan, unknown>[] {
  return [
    column.accessor("name", {
      header: "Plan",
      enableSorting: false,
      cell: (info) => (
        <HStack gap="2">
          <Text>{info.getValue<string>()}</Text>
          {!info.row.original.active && <Badge>Inactive</Badge>}
        </HStack>
      ),
    }),
    column.display({
      id: "price",
      header: () => <Text textAlign="end">Price</Text>,
      cell: ({ row }) => <Text textAlign="end">{pricePerPeriod(row.original)}</Text>,
    }),
    column.display({
      id: "actions",
      header: () => <VisuallyHidden>Actions</VisuallyHidden>,
      cell: ({ row }) => <PlanActions plan={row.original} settings={settings} />,
    }),
  ];
}

/** The plans the school offers, by name; the owner adds, edits and removes them. */
export function PlansPage() {
  const settings = useQuery(moneySettingsQuery).data;
  // Built once per currency, not each render: a new cell component would remount a row's open dialog.
  const columns = useMemo(() => (settings ? columnsFor(settings) : []), [settings]);
  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Plans</Heading>
        {settings && <PlanFormDialog settings={settings} trigger={<Button>New plan</Button>} />}
      </Flex>
      {settings && (
        <SimpleQueryTable
          aria-label="Plans"
          query={plansQuery}
          columns={columns}
          getRowId={(plan) => plan.id}
          emptyText="No plans yet."
          errorText="The plans could not be loaded."
        />
      )}
    </Stack>
  );
}
