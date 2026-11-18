import { ClientOnly, IconButton, Skeleton, type IconButtonProps } from "@chakra-ui/react";
import { ThemeProvider, useTheme } from "next-themes";
import type { ReactNode } from "react";
import { LuMoon, LuSun } from "react-icons/lu";
import { cspNonce } from "@jwcarman/roux-web/theme";

/** Light or dark mode, following the system's until the user picks one (kept in localStorage). */
export function ColorModeProvider({ children }: { children: ReactNode }) {
  return (
    // next-themes adds a <style> while it switches modes, which needs the page's nonce.
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem disableTransitionOnChange nonce={cspNonce()}>
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
