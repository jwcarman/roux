import {
  Box,
  Button,
  CloseButton,
  Container,
  Drawer,
  Flex,
  Heading,
  IconButton,
  Portal,
  Stack,
  Text,
} from "@chakra-ui/react";
import { Outlet, Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { LuLogOut, LuMenu } from "react-icons/lu";
import { ColorModeButton } from "./colorMode";
import { Logo } from "./Logo";
import { navItemsFor } from "./nav";
import { useSession } from "./session";
import { useTheme } from "./themeContext";

/**
 * The app's frame. Signed in: a sidebar, full from `lg`, an icon rail at `md`, and below that a top
 * bar whose menu button opens it as a drawer. Signed out: a slim header.
 */
export function Layout() {
  const { me } = useSession();
  const appName = useTheme().shown.appName;
  const [drawerOpen, setDrawerOpen] = useState(false);

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
    <Flex minH="100dvh" bg="bg">
      <Box
        as="aside"
        hideBelow="md"
        width={{ md: "16", lg: "60" }}
        flexShrink="0"
        position="sticky"
        top="0"
        height="100dvh"
        borderEndWidth="1px"
        bg="bg.subtle"
      >
        <Sidebar compact />
      </Box>
      <Box flex="1" minW="0">
        <Flex as="header" hideFrom="md" px="4" py="2" align="center" gap="3" borderBottomWidth="1px">
          <IconButton aria-label="Open navigation" variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
            <LuMenu />
          </IconButton>
          <Heading size="md" as="h1" display="flex" alignItems="center" gap="2">
            <Logo />
            {appName}
          </Heading>
        </Flex>
        <Container maxW="3xl" py="6" as="main">
          <Outlet />
        </Container>
      </Box>
      <Drawer.Root open={drawerOpen} onOpenChange={(event) => setDrawerOpen(event.open)} placement="start" size="xs">
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Title srOnly>Navigation</Drawer.Title>
              <Drawer.Body p="0">
                <Sidebar onNavigate={() => setDrawerOpen(false)} />
              </Drawer.Body>
              <Drawer.CloseTrigger asChild>
                <CloseButton size="sm" aria-label="Close navigation" />
              </Drawer.CloseTrigger>
            </Drawer.Content>
          </Drawer.Positioner>
        </Portal>
      </Drawer.Root>
    </Flex>
  );
}

interface SidebarProps {
  /** Below `lg`, show icons only (each link keeps its label as its accessible name and title). */
  compact?: boolean;
  /** Called after a link is followed, to close the drawer. */
  onNavigate?: () => void;
}

function Sidebar({ compact = false, onNavigate }: SidebarProps) {
  const { me, profile, signOut } = useSession();
  const appName = useTheme().shown.appName;
  const navigate = useNavigate();
  // In the rail, labels show from `lg`; in the drawer, always.
  const labelShown = compact ? { hideBelow: "lg" } : {};

  async function onSignOut() {
    onNavigate?.();
    await signOut();
    await navigate({ to: "/signin" });
  }

  return (
    <Flex direction="column" height="full" py="4" gap="4">
      <Heading
        size="md"
        as="h1"
        display="flex"
        alignItems="center"
        gap="2"
        px="4"
        justifyContent={compact ? { md: "center", lg: "start" } : "start"}
      >
        <Logo />
        <Text as="span" {...labelShown}>
          {appName}
        </Text>
      </Heading>
      <Stack as="nav" aria-label="Main" gap="1" px="2" flex="1">
        {navItemsFor(me).map((item) => (
          <Button
            key={item.to}
            asChild
            variant="ghost"
            justifyContent={compact ? { md: "center", lg: "start" } : "start"}
            gap="3"
            fontWeight="normal"
            _currentPage={{ bg: "colorPalette.subtle", fontWeight: "semibold" }}
          >
            <RouterLink
              to={item.to}
              activeOptions={{ exact: item.to === "/" }}
              aria-label={item.label}
              title={item.label}
              onClick={onNavigate}
            >
              <item.icon aria-hidden />
              <Text as="span" {...labelShown}>
                {item.label}
              </Text>
            </RouterLink>
          </Button>
        ))}
      </Stack>
      <Stack
        as="section"
        aria-label="Account"
        gap="2"
        px="2"
        pt="4"
        borderTopWidth="1px"
        align={compact ? { md: "center", lg: "stretch" } : "stretch"}
      >
        {profile && (
          <Text fontSize="sm" px="2" truncate {...labelShown}>
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
            <Text as="span" {...labelShown}>
              Sign out
            </Text>
          </Button>
        </Flex>
      </Stack>
    </Flex>
  );
}
