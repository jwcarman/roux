import { createFileRoute, stripSearchParams } from "@tanstack/react-router";
import { MEMBERS_READ } from "../../../permissions.gen";
import { requirePermission } from "../../../shell/guards";
import {
  MEMBER_ROLES,
  MEMBER_SORTS,
  MEMBER_STATUSES,
  Members,
  MEMBERS_SEARCH_DEFAULTS,
  type MembersSearch,
} from "../../../members/MembersPage";
import { enumSearchOf, tableSearchOf } from "@jwcarman/roux-web/paging";

export const Route = createFileRoute("/_signedIn/members/")({
  beforeLoad: ({ context }) => requirePermission(context.session.currentMe(), MEMBERS_READ),
  validateSearch: (raw: Record<string, unknown>): MembersSearch => ({
    ...tableSearchOf(raw, MEMBER_SORTS),
    role: enumSearchOf(raw.role, MEMBER_ROLES),
    status: enumSearchOf(raw.status, MEMBER_STATUSES),
  }),
  search: { middlewares: [stripSearchParams(MEMBERS_SEARCH_DEFAULTS)] },
  component: Members,
});
