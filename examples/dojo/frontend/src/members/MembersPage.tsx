import { Flex, Heading, Link, Stack } from "@chakra-ui/react";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import { DEFAULT_PAGE_SIZE, DebouncedSearchInput, FilterChips, QueryTable } from "@jwcarman/roux-web/table";
import { MEMBERS_INVITE, type Member } from "../api";
import { ExportButton, exportHref } from "../shell/ExportButton";
import { membersPage, ROLE_LABELS } from "./members";
import { useSession } from "../shell/session";
import { InviteForm } from "./InviteForm";

/** The directory's sorts: the column ids, and `MemberSort`'s values on the server. */
export const MEMBER_SORTS = ["NAME", "EMAIL", "ROLE"] as const;
type MemberSort = (typeof MEMBER_SORTS)[number];

/** The directory's defaults, left out of the URL. */
/** The directory's filters: the server's AppRole and MemberStatus values. */
export const MEMBER_ROLES = ["OWNER", "INSTRUCTOR", "MEMBER"] as const;
export const MEMBER_STATUSES = ["ACTIVE", "DEACTIVATED"] as const;

const ROLE_CHIPS = [
  { value: "OWNER", label: "Owners" },
  { value: "INSTRUCTOR", label: "Instructors" },
  { value: "MEMBER", label: "Members" },
] as const;

const STATUS_CHIPS = [
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
] as const;

/** The directory's URL: page, sort and search, plus its filters (all optional). */
export type MembersSearch = TableSearch<MemberSort> & {
  role?: (typeof MEMBER_ROLES)[number];
  status?: (typeof MEMBER_STATUSES)[number];
};

export const MEMBERS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "NAME",
  sortDirection: "ASC",
} as const satisfies TableSearch<MemberSort>;

const column = createColumnHelper<Member>();

const COLUMNS: ColumnDef<Member, unknown>[] = [
  column.accessor("displayName", {
    id: "NAME" satisfies MemberSort,
    header: "Name",
    cell: (info) => (
      <Link asChild>
        <RouterLink to="/members/$memberId" params={{ memberId: info.row.original.id }}>
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor("email", { id: "EMAIL" satisfies MemberSort, header: "Email" }),
  column.accessor("role", {
    id: "ROLE" satisfies MemberSort,
    header: "Role",
    cell: (info) => ROLE_LABELS[info.getValue()],
  }),
];

const route = getRouteApi("/_signedIn/members/");

/**
 * The team directory (paged, searchable, sortable) and, for an inviter, the invite form. The
 * page, sort and search live in the URL, so a reload, Back and a shared link keep them.
 */
export function Members() {
  const { me } = useSession();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const filters = { search: search.search, role: search.role, status: search.status };

  return (
    <Stack gap="6">
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Heading as="h2">Members</Heading>
        {me?.permissions.includes(MEMBERS_INVITE) && (
          <InviteForm />
        )}
      </Flex>
      <DebouncedSearchInput
        label="Search members"
        placeholder="Search members"
        term={search.search}
        // Typing replaces the history entry: Back skips the letters, not the searches.
        onSearchChange={(term) =>
          navigate({ search: (previous) => ({ ...previous, search: term, pageIndex: undefined }), replace: true })
        }
      />
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Flex gap="4" wrap="wrap">
          <FilterChips
            label="Status"
            options={STATUS_CHIPS}
            value={search.status ?? "ACTIVE"}
            onChange={(status) =>
              navigate({
                search: (previous) => ({
                  ...previous,
                  status: status === "ACTIVE" ? undefined : status,
                  pageIndex: undefined,
                }),
              })
            }
          />
          <FilterChips
            label="Role"
            options={ROLE_CHIPS}
            value={search.role}
            allLabel="All roles"
            onChange={(role) => navigate({ search: (previous) => ({ ...previous, role, pageIndex: undefined }) })}
          />
        </Flex>
        <ExportButton href={exportHref("/api/members/export.csv", { ...search })} />
      </Flex>
      <QueryTable
        aria-label="Members"
        query={membersPage(filters)}
        columns={COLUMNS}
        initialSort={{ id: MEMBERS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({ ...previous, ...next, sortBy: MEMBER_SORTS.find((sort) => sort === next.sortBy) }),
          })
        }
        getRowId={(member) => member.id}
        emptyText="No members found."
        errorText="Could not load the members."
      />
    </Stack>
  );
}
