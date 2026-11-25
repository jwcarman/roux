import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { USERS_READ } from "../../../permissions.gen";
import { requirePermission } from "@jwcarman/roux-web/session";
import {
  USER_ROLES,
  USER_SORTS,
  USER_STATUSES,
  Users,
  USERS_SEARCH_DEFAULTS,
  type UsersSearch,
} from "../../../users/UsersPage";
import { enumSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";

export const Route = createFileRoute("/_signedIn/users/")({
  beforeLoad: ({ context }) => requirePermission(context.me, USERS_READ),
  validateSearch: (raw: Record<string, unknown>): UsersSearch => ({
    ...tableSearchOf(raw, USER_SORTS),
    role: enumSearchOf(raw.role, USER_ROLES),
    status: enumSearchOf(raw.status, USER_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(USERS_SEARCH_DEFAULTS)] },
  component: Users,
});
