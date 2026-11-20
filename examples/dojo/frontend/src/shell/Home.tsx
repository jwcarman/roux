import { Heading, Link, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { USERS_READ } from "../permissions.gen";
import { useSession } from "./session";

export function Home() {
  const { me, profile } = useSession();
  const canSeeMembers = me?.permissions.includes(USERS_READ) ?? false;

  return (
    <Stack gap="4">
      <Heading as="h2" size="lg">
        Home
      </Heading>
      {profile && <Text>Welcome, {profile.displayName}</Text>}
      <Link asChild>
        <RouterLink to="/settings">Settings</RouterLink>
      </Link>
      {canSeeMembers && (
        <Link asChild>
          <RouterLink to="/members">Members</RouterLink>
        </Link>
      )}
    </Stack>
  );
}
