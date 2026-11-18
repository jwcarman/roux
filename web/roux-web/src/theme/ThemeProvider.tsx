import { ChakraProvider } from "@chakra-ui/react";
import createCache from "@emotion/cache";
import { CacheProvider } from "@emotion/react";
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { cspNonce } from "./csp";
import { loadFont } from "./fonts";
import { readPageTheme } from "./pageTheme";
import { createThemeSystem, type ShellTheme } from "./theme";

/** What `useShellTheme` answers. */
export interface ShellThemeState {
  /** The theme as last saved. */
  saved: ShellTheme;
  /** What the app shows now: the draft while one is previewed, else the saved theme. */
  shown: ShellTheme;
  /** Shows a draft on this screen only; `null` goes back to the saved theme. */
  preview: (draft: ShellTheme | null) => void;
  /** Makes `theme` the saved one, after the server has stored it, and drops the draft. */
  commit: (theme: ShellTheme) => void;
}

const ShellThemeContext = createContext<ShellThemeState | null>(null);

/**
 * Gives the app its look: the Chakra system built from the shown theme, the fonts it uses, Emotion's
 * styles carrying the page's Content-Security-Policy nonce (without which the browser refuses them),
 * and the app's name as the page title. It starts from the theme the server wrote into the page;
 * `theme` starts from another instead (a test, a storybook).
 *
 * Mount it once, above everything that uses Chakra.
 */
export function ThemeProvider({ theme, children }: { theme?: ShellTheme; children: ReactNode }) {
  const [saved, setSaved] = useState(() => theme ?? readPageTheme());
  const [draft, setDraft] = useState<ShellTheme | null>(null);
  const [cache] = useState(() => createCache({ key: "css", nonce: cspNonce() }));
  const shown = draft ?? saved;
  const system = useMemo(() => createThemeSystem(shown), [shown]);

  useEffect(() => {
    void loadFont(shown.headingFont);
    void loadFont(shown.bodyFont);
  }, [shown.headingFont, shown.bodyFont]);

  useEffect(() => {
    document.title = shown.appName;
  }, [shown.appName]);

  // One function for the provider's life (the setters are stable), so an effect that calls it runs once.
  const [commit] = useState(() => (next: ShellTheme) => {
    setSaved(next);
    setDraft(null);
  });
  const state = useMemo<ShellThemeState>(() => ({ saved, shown, preview: setDraft, commit }), [saved, shown, commit]);

  return (
    <ShellThemeContext value={state}>
      <CacheProvider value={cache}>
        <ChakraProvider value={system}>{children}</ChakraProvider>
      </CacheProvider>
    </ShellThemeContext>
  );
}

/** The app's theme, and the way to preview or keep another. */
export function useShellTheme(): ShellThemeState {
  const state = useContext(ShellThemeContext);
  if (state === null) {
    throw new Error("useShellTheme needs a ThemeProvider");
  }
  return state;
}
