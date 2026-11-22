import { Avatar, Box, Button, Icon, Menu, Stack, Switch, Text } from "@chakra-ui/react";
import { Link as RouterLink } from "@tanstack/react-router";
import { useId, type ElementType, type ReactNode } from "react";
import { LuChevronsUpDown } from "react-icons/lu";
import { RAIL_LABELS } from "./NavLinks";
import type { NavTo } from "./nav";

export interface AccountMenuProps {
  /** The person's name, drawn with their initials; undefined while it loads. */
  name?: string;
  /** Their email, under the name. */
  email?: string;
  /** From the shell's `AccountLayout`: in the sidebar, where the icon rail shows only the initials. */
  compact: boolean;
  /** The menu: {@link AccountMenuLink}, {@link AccountMenuItem}, {@link AccountMenuSwitch}, {@link AccountMenuSeparator}. */
  children: ReactNode;
}

/**
 * The account area as one button, "Account": the person's initials, name and email, which opens a
 * menu of `children` above it. In the icon rail only the initials show. Made for `AppShell`'s
 * `account`.
 */
export function AccountMenu({ name, email, compact, children }: AccountMenuProps) {
  const labels = compact ? RAIL_LABELS : {};
  return (
    // Fixed, so neither the sidebar nor the drawer clips it; not portalled, so the drawer keeps focus in it.
    <Menu.Root positioning={{ placement: "top-start", strategy: "fixed" }}>
      <Menu.Trigger asChild>
        <Button aria-label="Account" variant="ghost" w="full" h="auto" px="2" py="2" justifyContent="start" gap="3">
          <Avatar.Root size="sm" variant="subtle">
            <Avatar.Fallback name={name} />
          </Avatar.Root>
          <Stack gap="0" flex="1" minW="0" textAlign="start" {...labels}>
            <Text textStyle="sm" fontWeight="medium" truncate>
              {name}
            </Text>
            <Text textStyle="xs" color="fg.muted" fontWeight="normal" truncate>
              {email}
            </Text>
          </Stack>
          <Box as="span" color="fg.muted" {...labels}>
            <LuChevronsUpDown aria-hidden />
          </Box>
        </Button>
      </Menu.Trigger>
      <Menu.Positioner>
        <Menu.Content minW="14rem">{children}</Menu.Content>
      </Menu.Positioner>
    </Menu.Root>
  );
}

interface ItemProps {
  /** A Lucide icon, drawn before the label. */
  icon: ElementType;
  children: ReactNode;
}

/** A page to go to from the account menu; `onNavigate` closes the drawer (the shell's `close`). */
export function AccountMenuLink({ to, icon, onNavigate, children }: ItemProps & { to: NavTo; onNavigate?: () => void }) {
  return (
    <Menu.Item value={useId()} asChild onSelect={onNavigate}>
      <RouterLink to={to}>
        <Icon as={icon} aria-hidden />
        {children}
      </RouterLink>
    </Menu.Item>
  );
}

/** Something to do from the account menu, such as signing out; the menu shuts after. */
export function AccountMenuItem({ icon, onSelect, children }: ItemProps & { onSelect: () => void }) {
  return (
    <Menu.Item value={useId()} onSelect={onSelect}>
      <Icon as={icon} aria-hidden />
      {children}
    </Menu.Item>
  );
}

/** A setting turned on or off in place, such as dark mode, drawn as a switch; the menu stays open. */
export function AccountMenuSwitch({
  icon,
  checked,
  onCheckedChange,
  children,
}: ItemProps & { checked: boolean; onCheckedChange: (checked: boolean) => void }) {
  return (
    <Menu.CheckboxItem
      value={useId()}
      checked={checked}
      onCheckedChange={onCheckedChange}
      closeOnSelect={false}
      // The switch shows the state, so no room is kept for a check mark.
      ps="2"
    >
      <Icon as={icon} aria-hidden />
      <Box as="span" flex="1">
        {children}
      </Box>
      <Switch.Root size="sm" checked={checked} aria-hidden pointerEvents="none">
        <Switch.Control />
      </Switch.Root>
    </Menu.CheckboxItem>
  );
}

/** A line between groups in the account menu. */
export function AccountMenuSeparator() {
  return <Menu.Separator />;
}
