/** The lettering choices, and how each is loaded. */
export const FONTS = ["standard", "modern", "friendly", "classic"] as const;
export type Font = (typeof FONTS)[number];

/** Chakra's own font stack: the system's font, or Inter where it is installed. */
const SYSTEM_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Helvetica, Arial, sans-serif, "Apple Color Emoji", "Segoe UI Emoji", "Segoe UI Symbol"';

/** The CSS font family of each choice. Bundled fonts fall back to the system's while they load. */
export const FONT_FAMILY: Record<Font, string> = {
  standard: SYSTEM_STACK,
  modern: `"Inter Variable", ${SYSTEM_STACK}`,
  friendly: `"Nunito Variable", ${SYSTEM_STACK}`,
  classic: `"Lora Variable", Georgia, "Times New Roman", serif`,
};

/**
 * Loads a bundled font's stylesheet, once, when a theme first uses it. The fonts ship with the app
 * (fontsource): the page's Content-Security-Policy allows no other origin.
 */
export async function loadFont(font: Font): Promise<void> {
  switch (font) {
    case "standard":
      return;
    case "modern":
      await import("@fontsource-variable/inter");
      return;
    case "friendly":
      await import("@fontsource-variable/nunito");
      return;
    case "classic":
      await import("@fontsource-variable/lora");
      return;
  }
}
