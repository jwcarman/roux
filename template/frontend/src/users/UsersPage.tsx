import { Flex, Link, Stack } from "@chakra-ui/react";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { createColumnHelper, type ColumnDef } from "@tanstack/react-table";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import type { TableSearch } from "@jwcarman/roux-web/paging";
import {
  DEFAULT_PAGE_SIZE,
  DebouncedSearchInput,
  FilterChips,
  QueryTable,
} from "@jwcarman/roux-web/table";
import { type User } from "@jwcarman/roux-web/users";
import { useMe } from "../routes/_signedIn";
import { USERS_INVITE } from "../permissions.gen";
import { usersPage } from "@jwcarman/roux-web/users";
import { roleLabel } from "./users";
import { InviteForm } from "./InviteForm";

/** The directory's sorts: the column ids, and `UserSort`'s values on the server (roux). */
export const USER_SORTS = ["NAME", "EMAIL", "ROLE"] as const;
type UserSort = (typeof USER_SORTS)[number];

/** The directory's defaults, left out of the URL. */
/** The directory's filters: the app's roles (db/changelog/roles.xml) and the server's UserStatus values. */
export const USER_ROLES = ["OWNER", "USER"] as const;
export const USER_STATUSES = ["ACTIVE", "DEACTIVATED"] as const;

const ROLE_CHIPS = [
  { value: "OWNER", label: "Owners" },
  { value: "USER", label: "Users" },
] as const;

const STATUS_CHIPS = [
  { value: "ACTIVE", label: "Active" },
  { value: "DEACTIVATED", label: "Deactivated" },
] as const;

/** The directory's URL: page, sort and search, plus its filters (all optional). */
export type UsersSearch = TableSearch<UserSort> & {
  role?: (typeof USER_ROLES)[number];
  status?: (typeof USER_STATUSES)[number];
};

export const USERS_SEARCH_DEFAULTS = {
  pageIndex: 0,
  pageSize: DEFAULT_PAGE_SIZE,
  sortBy: "NAME",
  sortDirection: "ASC",
} as const satisfies TableSearch<UserSort>;

const column = createColumnHelper<User>();

const COLUMNS: ColumnDef<User, unknown>[] = [
  column.accessor("displayName", {
    id: "NAME" satisfies UserSort,
    header: "Name",
    cell: (info) => (
      <Link asChild>
        <RouterLink
          to="/users/$userId"
          params={{ userId: info.row.original.id }}
        >
          {info.getValue()}
        </RouterLink>
      </Link>
    ),
  }),
  column.accessor("email", { id: "EMAIL" satisfies UserSort, header: "Email" }),
  column.accessor("role", {
    id: "ROLE" satisfies UserSort,
    header: "Role",
    cell: (info) => roleLabel(info.getValue()),
  }),
];

const route = getRouteApi("/_signedIn/users/");

/**
 * The team directory (paged, searchable, sortable) and, for an inviter, the invite form. The
 * page, sort and search live in the URL, so a reload, Back and a shared link keep them.
 */
export function Users() {
  const me = useMe();
  const search = route.useSearch();
  const navigate = route.useNavigate();
  const filters = {
    search: search.search,
    role: search.role,
    status: search.status,
  };

  return (
    <Stack gap="6">
      <PageHeader title="Users">
        {me.permissions.includes(USERS_INVITE) && <InviteForm />}
      </PageHeader>
      <DebouncedSearchInput
        label="Search users"
        placeholder="Search users"
        term={search.search}
        // Typing replaces the history entry: Back skips the letters, not the searches.
        onSearchChange={(term) =>
          navigate({
            search: (previous) => ({
              ...previous,
              search: term,
              pageIndex: undefined,
            }),
            replace: true,
          })
        }
      />
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
          onChange={(role) =>
            navigate({
              search: (previous) => ({
                ...previous,
                role,
                pageIndex: undefined,
              }),
            })
          }
        />
      </Flex>
      <QueryTable
        aria-label="Users"
        query={usersPage(filters)}
        columns={COLUMNS}
        initialSort={{ id: USERS_SEARCH_DEFAULTS.sortBy, desc: false }}
        params={search}
        onParamsChange={(next) =>
          navigate({
            search: (previous) => ({
              ...previous,
              ...next,
              sortBy: USER_SORTS.find((sort) => sort === next.sortBy),
            }),
          })
        }
        emptyText="No users found."
        errorText="Could not load the users."
      />
    </Stack>
  );
}
