import { DEFAULT_THEME, PALETTES, SHAPES, type ShellTheme } from "./theme";
import { FONTS } from "./fonts";

/** What `index.html` holds in `#app-theme` until a server fills it in: Vite's dev server serves it so. */
export const THEME_PLACEHOLDER = "__APP_THEME__";

const COLOR = /^#[0-9a-fA-F]{6}$/;

function refuse(what: string): never {
  throw new Error(`The page's theme (#app-theme) ${what}`);
}

function member<T extends string>(part: string, value: unknown, allowed: readonly T[]): T {
  if (!allowed.includes(value as T)) {
    return refuse(
      `has no ${part} ${JSON.stringify(value)} (it knows ${allowed.join(", ")}): is the server newer than the app?`,
    );
  }
  return value as T;
}

/**
 * The theme the server wrote into the page (`#app-theme`, by roux's shell). A page with no theme
 * element, or one the server has not filled in (Vite's dev server), is Chakra's stock look. A theme
 * the app does not know is an error: it means the server and the app disagree, and a quiet
 * fallback would hide that.
 */
export function readPageTheme(doc: Document = document): ShellTheme {
  const text = doc.getElementById("app-theme")?.innerHTML.trim();
  if (text === undefined || text === "" || text === THEME_PLACEHOLDER) {
    return DEFAULT_THEME;
  }
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return refuse("is not JSON");
  }
  if (typeof raw !== "object" || raw === null) {
    return refuse("is not an object");
  }
  const theme = raw as Record<string, unknown>;
  if (typeof theme.appName !== "string" || theme.appName.trim() === "") {
    return refuse("has no appName");
  }
  const brandColor = String(theme.brandColor);
  if (!COLOR.test(brandColor)) {
    return refuse(`has a brandColor ${JSON.stringify(theme.brandColor)} that is not #rrggbb`);
  }
  return {
    appName: theme.appName,
    palette: member("palette", theme.palette, PALETTES),
    brandColor,
    shape: member("shape", theme.shape, SHAPES),
    headingFont: member("headingFont", theme.headingFont, FONTS),
    bodyFont: member("bodyFont", theme.bodyFont, FONTS),
  };
}
