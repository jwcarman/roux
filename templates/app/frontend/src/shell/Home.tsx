import { Heading, Stack, Text } from "@chakra-ui/react";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import { useSession } from "@jwcarman/roux-web/session";

/**
 * The page the app opens on: a welcome, and nothing else yet. It is the blank page to start from;
 * the sidebar already leads everywhere else.
 */
export function Home() {
  const { profile } = useSession();
  const appName = useShellTheme().shown.appName;

  return (
    <Stack gap="2">
      <Heading as="h2" size="lg">
        {profile ? `Welcome, ${profile.displayName}` : "Welcome"}
      </Heading>
      <Text color="fg.muted">You're signed in to {appName}.</Text>
    </Stack>
  );
}
