// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Toaster, toaster } from "@jwcarman/roux-web/feedback";
import type { ThemeSettings } from "./theme";
import { useTheme } from "./themeContext";
import { invalidFields, stale } from "../testing/problems";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { Appearance } from "./Appearance";

const SAVED = {
  palette: "gray",
  brandColor: "#3b82f6",
  shape: "medium",
  headingFont: "standard",
  bodyFont: "standard",
  appName: "Dojo",
  version: 3,
} as const;

/** What the app shows, as the theme provider has it. */
function Shown() {
  const { shown, saved } = useTheme();
  return (
    <output aria-label="shown">
      {`${shown.palette} ${shown.shape} ${shown.headingFont} ${shown.bodyFont} ${shown.appName} | saved ${saved.appName}`}
    </output>
  );
}

const shown = () => screen.getByRole("status", { name: "shown" }).textContent;

type Saved = ThemeSettings & { version: number };

/**
 * Answers the theme as last saved, and each save with `answer`; by default a save at the current
 * version is kept at the next one, and any other is a 409. Returns the bodies saved, and
 * `saveElsewhere` for another owner's save.
 */
function serve(answer?: (body: Saved) => Response) {
  const saves: Saved[] = [];
  let current: Saved = SAVED;
  server.use(
    http.get("/api/theme", () => HttpResponse.json(current)),
    http.put("/api/theme", async ({ request }) => {
      const body = (await request.json()) as Saved;
      saves.push(body);
      if (answer) {
        return answer(body);
      }
      if (body.version !== current.version) {
        return stale();
      }
      current = { ...body, version: body.version + 1 };
      return HttpResponse.json(current);
    }),
  );
  const saveElsewhere = (settings: Partial<ThemeSettings>) => {
    current = { ...current, ...settings, version: current.version + 1 };
  };
  return { saves, saveElsewhere };
}

function show() {
  const view = renderWithProviders(
    <>
      <Appearance />
      <Shown />
      <Toaster />
    </>,
  );
  return { ...view, user: userEvent.setup() };
}

describe("Appearance", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("starts from the saved theme", async () => {
    serve();
    show();

    expect(await screen.findByRole("textbox", { name: "What should the app be called?" })).toHaveValue("Dojo");
  });

  it("takes the loaded look as the saved one", async () => {
    serve();
    show();
    await screen.findByRole("textbox", { name: "What should the app be called?" });

    await waitFor(() => expect(shown()).toBe("gray medium standard standard Dojo | saved Dojo"));
  });

  it("shows which shape is in use", async () => {
    serve();
    show();

    expect(await screen.findByRole("button", { name: "Rounded" })).toHaveAttribute("aria-pressed", "true");
  });

  it("shows every shape when the one in use is not among the first three", async () => {
    server.use(http.get("/api/theme", () => HttpResponse.json({ ...SAVED, shape: "slight" })));
    show();

    expect(await screen.findByRole("button", { name: "Slightly rounded" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens More options when the owner's own color is in use", async () => {
    server.use(http.get("/api/theme", () => HttpResponse.json({ ...SAVED, palette: "brand", brandColor: "#c2410c" })));
    show();

    expect(await screen.findByRole("textbox", { name: "Color code" })).toHaveValue("#c2410c");
  });

  it("previews a ready-made look", async () => {
    serve();
    const { user } = show();

    await user.click(await screen.findByRole("button", { name: "Friendly" }));

    expect(shown()).toBe("teal round friendly friendly Dojo | saved Dojo");
  });

  it("previews a new name", async () => {
    serve();
    const { user } = show();
    const name = await screen.findByRole("textbox", { name: "What should the app be called?" });

    await user.clear(name);
    await user.type(name, "Kicks");

    expect(shown()).toContain("Kicks | saved");
  });

  it("previews a color and a shape", async () => {
    serve();
    const { user } = show();

    await user.click(await screen.findByRole("button", { name: "Teal" }));
    await user.click(screen.getByRole("button", { name: "Square" }));

    expect(shown()).toMatch(/^teal square /);
  });

  it("saves the look at the version it read, and keeps it", async () => {
    const { saves } = serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "Calm" }));

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("The new look is saved")).toBeInTheDocument();
    expect(saves).toEqual([
      {
        palette: "blue",
        brandColor: "#3b82f6",
        shape: "slight",
        headingFont: "standard",
        bodyFont: "standard",
        appName: "Dojo",
        version: 3,
      },
    ]);
    expect(shown()).toBe("blue slight standard standard Dojo | saved Dojo");
  });

  it("puts the look back as it was with Undo", async () => {
    const { saves } = serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual({ ...SAVED, version: 4 });
    await waitFor(() => expect(shown()).toBe("gray medium standard standard Dojo | saved Dojo"));
  });

  it("shows the server's reason under the name", async () => {
    serve(() => invalidFields({ appName: "Must be between 0 and 60 characters" }));
    const { user } = show();
    await screen.findByRole("textbox", { name: "What should the app be called?" });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Must be between 0 and 60 characters")).toBeInTheDocument();
  });

  it("says so when the look was changed elsewhere", async () => {
    serve(() => stale());
    const { user } = show();
    await screen.findByRole("textbox", { name: "What should the app be called?" });

    await user.click(screen.getByRole("button", { name: "Save" }));

    // The toaster also keeps an empty live region with role="alert": find the toast by its text.
    const title = await screen.findByText("Could not save the look");
    expect(title.closest("[role=alert]")).toHaveTextContent("This record changed since you loaded it");
  });

  it("starts over from the other owner's look when they saved first", async () => {
    const { saves, saveElsewhere } = serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "Calm" }));
    saveElsewhere({ palette: "teal", appName: "Kicks" });

    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("This record changed since you loaded it")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole("button", { name: "Teal" })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.getByRole("textbox", { name: "What should the app be called?" })).toHaveValue("Kicks");
    await waitFor(() => expect(shown()).toBe("teal medium standard standard Kicks | saved Kicks"));

    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(saves).toHaveLength(2));
    expect(saves[1]).toEqual({ ...SAVED, palette: "teal", appName: "Kicks", version: 4 });
  });

  it("goes back to the saved look with Cancel", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "Friendly" }));

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(shown()).toBe("gray medium standard standard Dojo | saved Dojo");
    expect(screen.getByRole("textbox", { name: "What should the app be called?" })).toHaveValue("Dojo");
  });

  it("goes back to the saved look when the page is left unsaved", async () => {
    serve();
    const { user, rerender } = show();
    await user.click(await screen.findByRole("button", { name: "Friendly" }));
    expect(shown()).toMatch(/^teal /);

    rerender(<Shown />);

    expect(shown()).toMatch(/^gray /);
  });

  it("says when the owner's own color needs a darker shade for buttons", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const code = screen.getByRole("textbox", { name: "Color code" });

    await user.clear(code);
    await user.type(code, "#fff59d");

    expect(shown()).toMatch(/^brand /);
    expect(
      screen.getByText("In light mode, buttons use a slightly darker shade so they stand out."),
    ).toBeInTheDocument();
  });

  it("offers every shape and both letterings under More options", async () => {
    serve();
    const { user } = show();

    await user.click(await screen.findByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Extra rounded" }));
    await user.click(screen.getByRole("button", { name: "Classic headings" }));
    await user.click(screen.getByRole("button", { name: "Modern text" }));

    expect(shown()).toMatch(/^gray extra-round classic modern /);
  });
});
