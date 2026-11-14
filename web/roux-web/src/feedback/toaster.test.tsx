// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { notify } from "./notify";
import { Toaster, toaster } from "./toaster";

/** What the page's stylesheets say for `element`, inside the media query `media`. */
function styleIn(media: string, element: Element): string {
  const css = Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent ?? "")
    .join("\n");
  const pattern = Array.from(element.classList)
    .filter((name) => name.startsWith("css-"))
    .map((name) => new RegExp(`@media ${media} ?\\{\\.${name}\\{([^}]*)\\}`));
  return pattern.map((p) => p.exec(css)?.[1] ?? "").join(";");
}

describe("toaster", () => {
  afterEach(() => act(() => toaster.remove()));

  it("shows toasts at the bottom end, and pauses them while the page is idle", () => {
    expect(toaster.attrs.placement).toBe("bottom-end");
    expect(toaster.attrs.pauseOnPageIdle).toBe(true);
  });

  it("gives a toast a small card from the medium breakpoint up", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.error("Couldn't save"));
    const toast = await screen.findByRole("alert");
    expect(styleIn("screen and \\(min-width: 48rem\\)", toast)).toContain("width:var(--chakra-sizes-sm)");
  });

  it("insets the toasts from both edges below the medium breakpoint", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.error("Couldn't save"));
    const toast = await screen.findByRole("alert");
    const group = toast.closest("[data-part=group]");
    expect(group).not.toBeNull();
    expect(styleIn("screen and \\(max-width: 47\\.9975rem\\)", group as Element)).toContain(
      "inset-inline:var(--chakra-spacing-4)",
    );
  });

  it("shows the title and the description in their own parts, and no description when there is none", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.error("Couldn't save", "The server did not answer."));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(document.querySelector("[data-part=title]")).toHaveTextContent("Couldn't save");
    expect(document.querySelector("[data-part=description]")).toHaveTextContent("The server did not answer.");

    act(() => toaster.remove());
    act(() => notify.success("Saved"));
    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(document.querySelector("[data-part=title]")).toHaveTextContent("Saved");
    expect(document.querySelector("[data-part=description]")).toBeNull();
  });

  it("marks a success as one", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.success("Saved"));
    expect(await screen.findByRole("status")).toHaveAttribute("data-type", "success");
  });
});
