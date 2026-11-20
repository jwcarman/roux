import { Badge, Button, Flex, HStack, Heading, Link, Stack, Text, VisuallyHidden } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import { DEFAULT_PAGE_SIZE, DebouncedSearchInput, FilterChips, QueryTable } from "@jwcarman/roux-web/table";
import { PAYMENTS_RECORD, STUDENTS_MANAGE } from "../permissions.gen";
import { RankSwatch } from "../ranks/RankSwatch";
import { ranksQuery } from "../ranks/ranks";
import { formatDate } from "../shell/format";
import { useSession } from "../shell/session";
import { StudentActions } from "./StudentActions";
import { StudentDialog } from "./StudentDialog";
import {
  STUDENT_SORTS,
  studentsPage,
  type PaymentState,
  type Student,
  type StudentSort,
  type StudentStatus,
} from "./students";

/** The list's URL: page, sort and search, plus its filters (all optional). */
export type StudentsSearch = TableSearch<StudentSort> & {
  status?: StudentStatus;
  rankId?: string;
  payment?: PaymentState;
};

/** The list's defaults, left out of the URL. */
export const STUDENTS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "NAME",
  sortDirection: "ASC",
} as const satisfies TableSearch<StudentSort>;

const STATUS_CHIPS = [
  { value: "ACTIVE", label: "Active" },
  { value: "INACTIVE", label: "Inactive" },
] as const;

const PAYMENT_CHIPS = [
  { value: "PAID", label: "Paid" },
  { value: "OVERDUE", label: "Overdue" },
  { value: "NONE", label: "No membership" },
] as const;

const column = createColumnHelper<Student>();

const READ_COLUMNS: ColumnDef<Student, unknown>[] = [
  column.accessor((student) => `${student.firstName} ${student.lastName}`, {
    id: "NAME" satisfies StudentSort,
    header: "Name",
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/students/$studentId" params={{ studentId: info.row.original.id }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor((student) => student.currentRank?.name ?? null, {
    id: "RANK" satisfies StudentSort,
    header: "Rank",
    cell: ({ row }) => {
      const rank = row.original.currentRank;
      return rank ? (
        <HStack gap="2">
          <RankSwatch colour={rank.colour} />
          <Text>{rank.name}</Text>
        </HStack>
      ) : (
        "—"
      );
    },
  }),
  column.accessor("startDate", {
    id: "START_DATE" satisfies StudentSort,
    header: "Started",
    cell: (info) => formatDate(info.getValue()),
  }),
  column.accessor("email", { header: "Email", enableSorting: false, cell: (info) => info.getValue() ?? "—" }),
];

/** The columns for whoever records payments: the plan, and paid through with an Overdue badge. */
const PAYMENT_COLUMNS: ColumnDef<Student, unknown>[] = [
  column.accessor((student) => student.planName ?? null, {
    id: "plan",
    header: "Plan",
    enableSorting: false,
    cell: (info) => info.getValue() ?? "—",
  }),
  column.accessor((student) => student.paidThrough ?? null, {
    id: "PAID_THROUGH" satisfies StudentSort,
    header: "Paid through",
    cell: ({ row }) =>
      row.original.paidThrough ? (
        <HStack gap="2">
          <Text>{formatDate(row.original.paidThrough)}</Text>
          {row.original.payment === "OVERDUE" && <Badge colorPalette="red">Overdue</Badge>}
        </HStack>
      ) : (
        "—"
      ),
  }),
];

const ACTIONS: ColumnDef<Student, unknown> = column.display({
  id: "actions",
  header: () => <VisuallyHidden>Actions</VisuallyHidden>,
  cell: ({ row }) => <StudentActions student={row.original} />,
});

/** Each permission's columns. Fixed, not built on each render: a new cell component would remount
 * the row's dialog and close it whenever the page re-renders (the rank chips arriving, say). */
const COLUMNS = {
  read: READ_COLUMNS,
  manage: [...READ_COLUMNS, ACTIONS],
  readWithPayments: [...READ_COLUMNS, ...PAYMENT_COLUMNS],
  manageWithPayments: [...READ_COLUMNS, ...PAYMENT_COLUMNS, ACTIONS],
};

function columnsFor(manages: boolean, recordsPayments: boolean): ColumnDef<Student, unknown>[] {
  if (recordsPayments) {
    return manages ? COLUMNS.manageWithPayments : COLUMNS.readWithPayments;
  }
  return manages ? COLUMNS.manage : COLUMNS.read;
}

const route = getRouteApi("/_signedIn/students/");

/** The students: paged, sortable, searchable, filtered by status and current rank, all in the URL. */
export function StudentsPage() {
  const { me } = useSession();
  const manages = me?.permissions.includes(STUDENTS_MANAGE) ?? false;
  const recordsPayments = me?.permissions.includes(PAYMENTS_RECORD) ?? false;
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const ranks = useQuery(ranksQuery);
  const rankChips = (ranks.data ?? []).map((rank) => ({ value: rank.id, label: rank.name }));

  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Students</Heading>
        {manages && <StudentDialog trigger={<Button>New student</Button>} />}
      </Flex>
      <DebouncedSearchInput
        label="Search students"
        placeholder="Search by name or email"
        term={search.search}
        // Typing replaces the history entry: Back skips the letters, not the searches.
        onSearchChange={(term) =>
          navigate({ search: (previous) => ({ ...previous, search: term, pageIndex: undefined }), replace: true })
        }
      />
      <Flex gap="4" wrap="wrap">
        <FilterChips
          label="Status"
          options={STATUS_CHIPS}
          value={search.status}
          defaultValue="ACTIVE"
          onChange={(status) => navigate({ search: (previous) => ({ ...previous, status, pageIndex: undefined }) })}
        />
        <FilterChips
          label="Rank"
          options={rankChips}
          value={search.rankId}
          allLabel="All ranks"
          onChange={(rankId) => navigate({ search: (previous) => ({ ...previous, rankId, pageIndex: undefined }) })}
        />
        {recordsPayments && (
          <FilterChips
            label="Payment"
            options={PAYMENT_CHIPS}
            value={search.payment}
            allLabel="Any payment"
            onChange={(payment) => navigate({ search: (previous) => ({ ...previous, payment, pageIndex: undefined }) })}
          />
        )}
      </Flex>
      <QueryTable
        aria-label="Students"
        query={studentsPage({
          search: search.search,
          status: search.status,
          rankId: search.rankId,
          payment: recordsPayments ? search.payment : undefined,
        })}
        columns={columnsFor(manages, recordsPayments)}
        initialSort={{ id: STUDENTS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...next,
              sortBy: STUDENT_SORTS.find((sort) => sort === next.sortBy),
            }),
          })
        }
        getRowId={(student) => student.id}
        emptyText="No students found."
        errorText="Could not load the students."
      />
    </Stack>
  );
}
