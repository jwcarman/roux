import { Box, Button, Container, Flex, Heading, Text } from "@chakra-ui/react";
import { Outlet, useNavigate } from "@tanstack/react-router";
import { LuLogOut } from "react-icons/lu";
import { AppShell, RAIL_LABELS, type AccountLayout } from "@jwcarman/roux-web/navigation";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import { ColorModeButton } from "./colorMode";
import { Logo } from "./Logo";
import { nav } from "./nav";
import { useSession } from "./session";

/**
 * The app's frame. Signed in: roux's `AppShell` (a sidebar, an icon rail and a drawer) with this
 * app's account area. Signed out: a slim header.
 */
export function Layout() {
  const { me } = useSession();
  const appName = useShellTheme().shown.appName;

  if (!me) {
    return (
      <Box minH="100dvh" bg="bg">
        <Flex as="header" px="6" py="3" align="center" justify="space-between" borderBottomWidth="1px">
          <Heading size="md" as="h1" display="flex" alignItems="center" gap="2">
            <Logo />
            {appName}
          </Heading>
          <ColorModeButton />
        </Flex>
        <Container maxW="3xl" py="6" as="main">
          <Outlet />
        </Container>
      </Box>
    );
  }

  return (
    <AppShell
      nav={nav}
      permissions={me.permissions}
      appName={appName}
      logo={<Logo />}
      account={(layout) => <Account {...layout} />}
    >
      <Outlet />
    </AppShell>
  );
}

/** The person's name, the mode switch and sign out, small in the rail. */
function Account({ compact, close }: AccountLayout) {
  const { profile, signOut } = useSession();
  const navigate = useNavigate();
  const labels = compact ? RAIL_LABELS : {};

  async function onSignOut() {
    close();
    await signOut();
    await navigate({ to: "/signin" });
  }

  return (
    <>
      {profile && (
        <Text fontSize="sm" px="2" truncate {...labels}>
          {profile.displayName}
        </Text>
      )}
      <Flex gap="2" align="center" direction={compact ? { md: "column", lg: "row" } : "row"}>
        <ColorModeButton />
        <Button
          size="sm"
          variant="outline"
          onClick={onSignOut}
          aria-label="Sign out"
          title="Sign out"
          // Stretched beside the mode button when labelled; its own size in the rail's column.
          flex={compact ? { md: "none", lg: "1" } : "1"}
        >
          <LuLogOut aria-hidden />
          <Text as="span" {...labels}>
            Sign out
          </Text>
        </Button>
      </Flex>
    </>
  );
}
