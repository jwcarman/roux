import { Button, Stack, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { navItemsFor, type Nav, type Permissions } from "./nav";

/** How the labels hide in the icon rail: below `lg`. */
export const RAIL_LABELS = { hideBelow: "lg" } as const;

export interface NavLinksProps<Permission extends string> {
  nav: Nav<Permission>;
  /** The permissions of the signed-in person: items they lack are not drawn. */
  permissions: Permissions;
  /** Draw icons only below `lg` (each link keeps its label as its accessible name and title): the rail. */
  compact?: boolean;
  /** Called after a link is followed, to close the drawer. */
  onNavigate?: () => void;
}

/**
 * The navigation's links, as `<nav aria-label="Main">`: one ghost button per item the person may
 * open, with its icon and label, the current page marked (`aria-current="page"`; Home only on `/` itself).
 */
export function NavLinks<Permission extends string>({
  nav,
  permissions,
  compact = false,
  onNavigate,
}: NavLinksProps<Permission>) {
  const labels = compact ? RAIL_LABELS : {};
  return (
    <Stack as="nav" aria-label="Main" gap="1" px="2" flex="1">
      {navItemsFor(nav, permissions).map((item) => (
        <Button
          key={item.label}
          asChild
          variant="ghost"
          justifyContent={compact ? { md: "center", lg: "start" } : "start"}
          gap="3"
          fontWeight="normal"
          _currentPage={{ bg: "colorPalette.subtle", fontWeight: "semibold" }}
        >
          <RouterLink to={item.to} aria-label={item.label} title={item.label} onClick={onNavigate}>
            <item.icon aria-hidden />
            <Text as="span" {...labels}>
              {item.label}
            </Text>
          </RouterLink>
        </Button>
      ))}
    </Stack>
  );
}
