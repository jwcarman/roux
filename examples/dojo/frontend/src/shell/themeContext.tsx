import { ChakraProvider } from "@chakra-ui/react";
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { loadFont } from "./fonts";
import { systemFor, type ThemeSettings } from "./theme";

export interface ThemeState {
  /** The theme as last saved. */
  saved: ThemeSettings;
  /** What the app shows now: the draft while one is previewed, else the saved theme. */
  shown: ThemeSettings;
  /** Shows a draft on this screen only; `null` goes back to the saved theme. */
  preview: (draft: ThemeSettings | null) => void;
  /** Makes `theme` the saved one, after the server has stored it, and drops the draft. */
  commit: (theme: ThemeSettings) => void;
}

const ThemeContext = createContext<ThemeState | null>(null);

/**
 * Gives the app its look: the Chakra system built from the shown theme, the fonts it uses, and the
 * app's name as the page title. Starts from `initial`, the theme the server wrote into the page.
 */
export function ThemeProvider({ initial, children }: { initial: ThemeSettings; children: ReactNode }) {
  const [saved, setSaved] = useState(initial);
  const [draft, setDraft] = useState<ThemeSettings | null>(null);
  const shown = draft ?? saved;
  const system = useMemo(() => systemFor(shown), [shown]);

  useEffect(() => {
    void loadFont(shown.headingFont);
    void loadFont(shown.bodyFont);
  }, [shown.headingFont, shown.bodyFont]);

  useEffect(() => {
    document.title = shown.appName;
  }, [shown.appName]);

  const commit = useCallback((theme: ThemeSettings) => {
    setSaved(theme);
    setDraft(null);
  }, []);
  const state = useMemo<ThemeState>(() => ({ saved, shown, preview: setDraft, commit }), [saved, shown, commit]);

  return (
    <ThemeContext value={state}>
      <ChakraProvider value={system}>{children}</ChakraProvider>
    </ThemeContext>
  );
}

/** The app's theme, and the way to preview or keep another. */
export function useTheme(): ThemeState {
  const state = useContext(ThemeContext);
  if (state === null) {
    throw new Error("useTheme needs a ThemeProvider");
  }
  return state;
}
