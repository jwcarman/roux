import { Box, Button, Flex, HStack, Heading, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { SimpleQueryTable } from "@jwcarman/roux-web/table";
import { RANKS_MANAGE } from "../api";
import { useSession } from "../shell/session";
import { RankActions } from "./RankActions";
import { RankFormDialog } from "./RankFormDialog";
import { BELT_SWATCHES, ranksApi, ranksQuery, type Rank } from "./ranks";

const column = createColumnHelper<Rank>();

const LADDER: ColumnDef<Rank, unknown>[] = [
  column.accessor("position", { header: "#", enableSorting: false }),
  column.accessor("name", {
    header: "Rank",
    enableSorting: false,
    cell: (info) => (
      <HStack gap="2">
        <Box
          aria-hidden
          width="4"
          height="4"
          borderRadius="l1"
          borderWidth="1px"
          borderColor="border.emphasized"
          style={{ background: BELT_SWATCHES[info.row.original.colour] }}
        />
        <Text>{info.getValue<string>()}</Text>
      </HStack>
    ),
  }),
];

/** The school's ranks, lowest first; the owner adds, edits, reorders and removes them. */
export function RanksPage() {
  const { me } = useSession();
  const manages = me?.permissions.includes(RANKS_MANAGE) ?? false;
  const columns: ColumnDef<Rank, unknown>[] = manages
    ? [
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
      ]
    : LADDER;

  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Ranks</Heading>
        {manages && <RankFormDialog trigger={<Button>New rank</Button>} />}
      </Flex>
      <SimpleQueryTable
        aria-label="Ranks"
        queryKey={ranksQuery.queryKey}
        query={() => ranksApi.list()}
        columns={columns}
        getRowId={(rank) => rank.id}
        emptyText="No ranks yet."
        errorText="The ranks could not be loaded."
      />
    </Stack>
  );
}
