import { Outlet } from "@tanstack/react-router";
import { LuLogOut, LuSettings } from "react-icons/lu";
import {
  AccountMenu,
  AccountMenuItem,
  AccountMenuLink,
  AccountMenuSeparator,
  AppShell,
  type AccountLayout,
} from "@jwcarman/roux-web/navigation";
import { SignInFrame } from "@jwcarman/roux-web/signin";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import { ColorModeButton, ColorModeSwitch } from "@jwcarman/roux-web/theme";
import { Logo } from "./Logo";
import { nav } from "./nav";
import { useSession } from "@jwcarman/roux-web/session";

/**
 * The app's frame. Signed in: roux's `AppShell` (a sidebar, an icon rail and a drawer) with this
 * app's account area. Signed out: roux's `SignInFrame`, a card centred on the page, with the mode
 * switch in the corner.
 */
export function Layout() {
  const { me } = useSession();
  const appName = useShellTheme().shown.appName;

  if (!me) {
    return (
      <SignInFrame tools={<ColorModeButton />}>
        <Outlet />
      </SignInFrame>
    );
  }

  return (
    <AppShell nav={nav} permissions={me.permissions} appName={appName} logo={<Logo />} account={accountArea}>
      <Outlet />
    </AppShell>
  );
}

/** The shell's account area: drawn as a component of its own, so its hooks are its own. */
function accountArea(layout: AccountLayout) {
  return <Account {...layout} />;
}

/** Who is signed in, as roux's account menu: their settings, dark mode and signing out. */
function Account({ compact, close }: AccountLayout) {
  const { profile, signOut } = useSession();

  // Signing out ends the session, and the guards then send the caller to sign in.
  return (
    <AccountMenu name={profile?.displayName} email={profile?.email} compact={compact}>
      <AccountMenuLink to="/settings" icon={LuSettings} onNavigate={close}>
        Settings
      </AccountMenuLink>
      <ColorModeSwitch />
      <AccountMenuSeparator />
      <AccountMenuItem icon={LuLogOut} onSelect={() => void signOut()}>
        Sign out
      </AccountMenuItem>
    </AccountMenu>
  );
}
