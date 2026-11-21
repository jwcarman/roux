import { Link, Stack } from "@chakra-ui/react";
import { useSuspenseQuery } from "@tanstack/react-query";
import { getRouteApi, Link as RouterLink } from "@tanstack/react-router";
import { LuArrowLeft } from "react-icons/lu";
import { USERS_MANAGE } from "../permissions.gen";
import { userQuery } from "./users";
import { useSession } from "../shell/session";
import { UserDetailView } from "./UserDetailView";

const route = getRouteApi("/_signedIn/users/$userId");

/** /users/$userId: the loader has fetched the user, so this renders with data at once. */
export function UserDetail() {
  const { userId } = route.useParams();
  const { data: user } = useSuspenseQuery(userQuery(userId));
  const { me } = useSession();
  return (
    <Stack gap="4">
      <Link asChild alignSelf="start" fontSize="sm">
        <RouterLink to="/users">
          <LuArrowLeft aria-hidden />
          All users
        </RouterLink>
      </Link>
      <UserDetailView
        user={user}
        canManage={me?.permissions.includes(USERS_MANAGE) ?? false}
        isSelf={me?.identityId === user.id}
      />
    </Stack>
  );
}
