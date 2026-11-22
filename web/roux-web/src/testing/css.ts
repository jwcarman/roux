/**
 * Every rule the styles hold for `element`'s classes, media queries included, as one string: what
 * a test reads to check a responsive or state style that jsdom does not apply.
 */
export function rulesFor(element: Element): string {
  const css = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");
  return Array.from(element.classList)
    .flatMap((name) => css.split("}").filter((rule) => rule.includes(`.${name}`)))
    .join("}\n");
}

/**
 * The colour palette Chakra's stylesheet gives `element` (a button's `colorPalette`, a badge's), by
 * the name of the palette it points at: "red", "blue". undefined when none applies.
 */
export function paletteOf(element: Element): string | undefined {
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
  for (const rule of rules) {
    if (rule instanceof CSSStyleRule && element.matches(rule.selectorText)) {
      const palette = /--chakra-colors-color-palette-500: var\(--chakra-colors-([a-z]+)-500\)/.exec(rule.cssText);
      if (palette !== null) {
        return palette[1];
      }
    }
  }
  return undefined;
}
