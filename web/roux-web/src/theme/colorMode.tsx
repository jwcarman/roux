import { ClientOnly, IconButton, Skeleton, type IconButtonProps } from "@chakra-ui/react";
import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { AccountMenuSwitch } from "../navigation";
import { cspNonce } from "./csp";

/** Light or dark mode, following the system's until the user picks one (kept in localStorage). */
export function ColorModeProvider({ children }: Readonly<{ children: ReactNode }>) {
  return (
    // next-themes adds a <style> while it switches modes, which needs the page's nonce. Its own
    // before-paint <script> only runs in server-rendered HTML; in this single-page app React renders
    // it and never runs it (index.html's inline script sets the mode before the first paint). Typed
    // as a data block, it is what it is, inert, and React does not warn about a script it won't run.
    <ThemeProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
      nonce={cspNonce()}
      scriptProps={{ type: "application/json" }}
    >
      {children}
    </ThemeProvider>
  );
}

/** Switches between light and dark mode; `props` style the button. */
export function ColorModeButton(props: Omit<IconButtonProps, "aria-label" | "onClick" | "children">) {
  const { resolvedTheme, setTheme } = useTheme();
  const dark = resolvedTheme === "dark";
  return (
    <ClientOnly fallback={<Skeleton boxSize="8" />}>
      <IconButton
        aria-label={dark ? "Switch to light mode" : "Switch to dark mode"}
        size="sm"
        variant="ghost"
        {...props}
        onClick={() => setTheme(dark ? "light" : "dark")}
      >
        {dark ? <LuSun /> : <LuMoon />}
      </IconButton>
    </ClientOnly>
  );
}

/** "Dark mode" in the account menu: a switch that is on in dark mode. */
export function ColorModeSwitch() {
  const { resolvedTheme, setTheme } = useTheme();
  return (
    <AccountMenuSwitch
      icon={LuMoon}
      checked={resolvedTheme === "dark"}
      onCheckedChange={(dark) => setTheme(dark ? "dark" : "light")}
    >
      Dark mode
    </AccountMenuSwitch>
  );
}
