import { Heading, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useMe } from "../routes/_signedIn";
import { USERS_READ } from "../permissions.gen";
import { useSession } from "./session";

export function Home() {
  const me = useMe();
  const { profile } = useSession();
  const canSeeUsers = me.permissions.includes(USERS_READ);

  return (
    <Stack gap="4">
      <Heading as="h2" size="lg">
        Home
      </Heading>
      {profile && <Text>Welcome, {profile.displayName}</Text>}
      <Link asChild>
        <RouterLink to="/settings">Settings</RouterLink>
      </Link>
      {canSeeUsers && (
        <Link asChild>
          <RouterLink to="/users">Users</RouterLink>
        </Link>
      )}
    </Stack>
  );
}
