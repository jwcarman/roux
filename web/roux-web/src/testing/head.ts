import { onTestFinished } from "vitest";

/**
 * Adds `html` to the document head for this test only. Test files share one document, and the head
 * holds every Emotion cache's styles: overwriting it would strip later files of their CSS.
 */
export function inHead(html: string): void {
  const template = document.createElement("template");
  template.innerHTML = html;
  const added = [...template.content.children];
  document.head.append(...added);
  onTestFinished(() => {
    for (const element of added) {
      element.remove();
    }
  });
}
