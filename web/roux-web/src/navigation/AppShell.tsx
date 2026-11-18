import { Box, CloseButton, Container, Drawer, Flex, Heading, IconButton, Portal, Stack, Text } from "@chakra-ui/react";
import { useState, type ReactNode } from "react";
import { LuMenu } from "react-icons/lu";
import { NavLinks, RAIL_LABELS } from "./NavLinks";
import type { Nav, Permissions } from "./nav";

/** What the shell tells the account area, so it can draw itself small in the rail. */
export interface AccountLayout {
  /** In the sidebar (icons only below `lg`), as opposed to the drawer. */
  compact: boolean;
  /** Closes the drawer; call it before leaving the page from the account area. */
  close: () => void;
}

export interface AppShellProps<Permission extends string> {
  nav: Nav<Permission>;
  /** The permissions of the signed-in person. */
  permissions: Permissions;
  /** What the app is called: `useShellTheme().shown.appName`. */
  appName: string;
  /** The app's mark, drawn beside the name. */
  logo?: ReactNode;
  /** The account area under the links (the person's name, sign out, a mode switch). */
  account?: (layout: AccountLayout) => ReactNode;
  /** The page: `<Outlet />`. */
  children: ReactNode;
}

/**
 * The signed-in frame: a sidebar full from `lg`, an icon rail at `md`, and below that a top bar
 * whose menu button ("Open navigation") opens the same sidebar as a drawer. The links are
 * {@link NavLinks}; the page goes in `children`.
 */
export function AppShell<Permission extends string>({
  nav,
  permissions,
  appName,
  logo,
  account,
  children,
}: AppShellProps<Permission>) {
  const [drawerOpen, setDrawerOpen] = useState(false);
  const close = () => setDrawerOpen(false);

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
        <Sidebar {...{ nav, permissions, appName, logo, account }} compact close={close} />
      </Box>
      <Box flex="1" minW="0">
        <Flex as="header" hideFrom="md" px="4" py="2" align="center" gap="3" borderBottomWidth="1px">
          <IconButton aria-label="Open navigation" variant="ghost" size="sm" onClick={() => setDrawerOpen(true)}>
            <LuMenu />
          </IconButton>
          <Heading size="md" as="h1" display="flex" alignItems="center" gap="2">
            {logo}
            {appName}
          </Heading>
        </Flex>
        <Container maxW="3xl" py="6" as="main">
          {children}
        </Container>
      </Box>
      <Drawer.Root open={drawerOpen} onOpenChange={(event) => setDrawerOpen(event.open)} placement="start" size="xs">
        <Portal>
          <Drawer.Backdrop />
          <Drawer.Positioner>
            <Drawer.Content>
              <Drawer.Title srOnly>Navigation</Drawer.Title>
              <Drawer.Body p="0">
                <Sidebar {...{ nav, permissions, appName, logo, account }} compact={false} close={close} />
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

interface SidebarProps<Permission extends string> extends Omit<AppShellProps<Permission>, "children"> {
  compact: boolean;
  close: () => void;
}

function Sidebar<Permission extends string>({
  nav,
  permissions,
  appName,
  logo,
  account,
  compact,
  close,
}: SidebarProps<Permission>) {
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
        {logo}
        <Text as="span" {...(compact ? RAIL_LABELS : {})}>
          {appName}
        </Text>
      </Heading>
      <NavLinks nav={nav} permissions={permissions} compact={compact} onNavigate={close} />
      {account && (
        <Stack
          as="section"
          aria-label="Account"
          gap="2"
          px="2"
          pt="4"
          borderTopWidth="1px"
          align={compact ? { md: "center", lg: "stretch" } : "stretch"}
        >
          {account({ compact, close })}
        </Stack>
      )}
    </Flex>
  );
}
