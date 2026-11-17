import { Button, Flex, HStack, Heading, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { RANKS_MANAGE } from "../api";
import { useSession } from "../shell/session";
import { RankActions } from "./RankActions";
import { RankFormDialog } from "./RankFormDialog";
import { ranksQuery, type Rank } from "./ranks";
import { RankSwatch } from "./RankSwatch";

const column = createColumnHelper<Rank>();

const LADDER: ColumnDef<Rank, unknown>[] = [
  column.accessor("position", { header: "#", enableSorting: false }),
  column.accessor("name", {
    header: "Rank",
    enableSorting: false,
    cell: (info) => (
      <HStack gap="2">
        <RankSwatch colour={info.row.original.colour} />
        <Text>{info.getValue<string>()}</Text>
      </HStack>
    ),
  }),
];

/** The owner's columns. Fixed, not built on each render: a new cell component would remount the
 * row's dialog and close it whenever the page re-renders. */
const MANAGE_COLUMNS: ColumnDef<Rank, unknown>[] = [
  ...LADDER,
  column.display({
    id: "actions",
    header: () => <VisuallyHidden>Actions</VisuallyHidden>,
    cell: ({ row, table }) => (
      <RankActions
        rank={row.original}
        first={row.index === 0}
        last={row.index === table.getRowModel().rows.length - 1}
      />
    ),
  }),
];

/** The school's ranks, lowest first; the owner adds, edits, reorders and removes them. */
export function RanksPage() {
  const { me } = useSession();
  const manages = me?.permissions.includes(RANKS_MANAGE) ?? false;
  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Ranks</Heading>
        {manages && <RankFormDialog trigger={<Button>New rank</Button>} />}
      </Flex>
      <SimpleQueryTable
        aria-label="Ranks"
        query={ranksQuery}
        columns={manages ? MANAGE_COLUMNS : LADDER}
        getRowId={(rank) => rank.id}
        emptyText="No ranks yet."
        errorText="The ranks could not be loaded."
      />
    </Stack>
  );
}
