/**
 * Every rule the styles hold for `element`'s classes, media queries included, as one string: what
 * a test reads to check a responsive or state style that jsdom does not apply.
 */
export function rulesFor(element: HTMLElement): string {
  const css = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");
  return Array.from(element.classList)
    .flatMap((name) => css.split("}").filter((rule) => rule.includes(`.${name}`)))
    .join("}\n");
}
