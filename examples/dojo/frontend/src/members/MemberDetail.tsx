import { Link, Stack } from "@chakra-ui/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { LuArrowLeft } from "react-icons/lu";
import { MEMBERS_MANAGE } from "../permissions.gen";
import { memberQuery } from "./members";
import { useSession } from "../shell/session";
import { MemberDetailView } from "./MemberDetailView";

const route = getRouteApi("/_signedIn/members/$memberId");

/** /members/$memberId: the loader has fetched the member, so this renders with data at once. */
export function MemberDetail() {
  const { memberId } = route.useParams();
  const { data: member } = useSuspenseQuery(memberQuery(memberId));
  const { me } = useSession();
  return (
    <Stack gap="4">
      <Link asChild alignSelf="start" fontSize="sm">
        <RouterLink to="/members">
          <LuArrowLeft aria-hidden />
          All members
        </RouterLink>
      </Link>
      <MemberDetailView
        member={member}
        canManage={me?.permissions.includes(MEMBERS_MANAGE) ?? false}
        isSelf={me?.identityId === member.id}
      />
    </Stack>
  );
}
