// @vitest-environment jsdom
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "../feedback";
import { createQueryClient } from "../api/queryClient";
import { rulesFor } from "../testing/css";
import { invalidFields, stale } from "../testing/problems";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { AppearanceSettings } from "./AppearanceSettings";
import type { ShellTheme } from "./theme";
import { ThemeProvider, useShellTheme } from "./ThemeProvider";

const fonts = vi.hoisted(() => ({ loaded: [] as string[] }));
vi.mock("@fontsource-variable/inter", () => {
  fonts.loaded.push("inter");
  return {};
});
vi.mock("@fontsource-variable/nunito", () => {
  fonts.loaded.push("nunito");
  return {};
});
vi.mock("@fontsource-variable/lora", () => {
  fonts.loaded.push("lora");
  return {};
});

const SAVED = {
  palette: "gray",
  brandColor: "#3b82f6",
  shape: "medium",
  depth: "flat",
  headingFont: "standard",
  bodyFont: "standard",
  appName: "Dojo",
  version: 3,
} as const;

/** What the app shows, as the theme provider has it. */
function Shown() {
  const { shown, saved } = useShellTheme();
  return (
    <>
      <output aria-label="shown">
        {`${shown.palette} ${shown.shape} ${shown.headingFont} ${shown.bodyFont} ${shown.appName} | saved ${saved.appName}`}
      </output>
      <output aria-label="shown depth">{shown.depth}</output>
    </>
  );
}

const shownDepth = () => screen.getByRole("status", { name: "shown depth" }).textContent;
const shown = () => screen.getByRole("status", { name: "shown" }).textContent;

type Saved = ShellTheme & { version: number };

/**
 * Answers the theme as last saved, and each save with `answer`; by default a save at the current
 * version is kept at the next one, and any other is a 409. Returns the bodies saved, and
 * `saveElsewhere` for another owner's save.
 */
function serve(answer?: (body: Saved) => Response) {
  const saves: Saved[] = [];
  let current: Saved = SAVED;
  server.use(
    http.get("/api/roux/theme", () => HttpResponse.json(current)),
    http.put("/api/roux/theme", async ({ request }) => {
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
  const saveElsewhere = (settings: Partial<ShellTheme>) => {
    current = { ...current, ...settings, version: current.version + 1 };
  };
  return { saves, saveElsewhere };
}

function show() {
  const view = renderWithProviders(
    <ThemeProvider theme={{ ...SAVED, appName: "Dojo" }}>
      <AppearanceSettings />
      <Shown />
      <Toaster />
    </ThemeProvider>,
    createQueryClient(),
  );
  return { ...view, user: userEvent.setup() };
}

describe("AppearanceSettings", () => {
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

  it("presses the saved shape, whichever it is", async () => {
    server.use(http.get("/api/roux/theme", () => HttpResponse.json({ ...SAVED, shape: "slight" })));
    show();

    expect(await screen.findByRole("button", { name: "Slightly rounded" })).toHaveAttribute("aria-pressed", "true");
  });

  it("opens More options when the owner's own color is in use", async () => {
    server.use(
      http.get("/api/roux/theme", () => HttpResponse.json({ ...SAVED, palette: "brand", brandColor: "#c2410c" })),
    );
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
        depth: "raised",
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

    rerender(
      <ThemeProvider theme={{ ...SAVED, appName: "Dojo" }}>
        <Shown />
      </ThemeProvider>,
    );

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

  it("shows a spinner while the look loads", async () => {
    server.use(http.get("/api/roux/theme", () => HttpResponse.json(SAVED)));
    show();

    expect(screen.getByLabelText("Loading")).toBeInTheDocument();
    await screen.findByRole("textbox", { name: "What should the app be called?" });
  });

  it("says so when the look cannot be loaded", async () => {
    server.use(http.get("/api/roux/theme", () => new HttpResponse(null, { status: 403 })));
    show();

    expect(await screen.findByText("The app's look could not be loaded. Try again in a moment.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Save" })).not.toBeInTheDocument();
  });

  it("takes a color from the color picker as the owner's own", async () => {
    serve();
    const { user, container } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));

    fireEvent.change(container.querySelector("input[type=color]")!, { target: { value: "#ff0000" } });

    expect(shown()).toMatch(/^brand /);
    expect(screen.getByRole("textbox", { name: "Color code" })).toHaveValue("#ff0000");
  });

  it("ignores a color code until it is a whole color, and keeps what was typed", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const code = screen.getByRole("textbox", { name: "Color code" });

    await user.clear(code);
    await user.type(code, "#FF88");
    expect(shown()).toMatch(/^gray /);

    await user.type(code, "00");
    expect(shown()).toMatch(/^brand /);
    expect(code).toHaveValue("#FF8800");
  });

  it("puts the color code back with Cancel", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const code = screen.getByRole("textbox", { name: "Color code" });
    await user.clear(code);
    await user.type(code, "#ff8800");

    await user.click(screen.getByRole("button", { name: "Cancel" }));

    expect(code).toHaveValue("#3b82f6");
  });

  it("shows the lettering samples in the app's name, or the lettering's name when it has none", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    expect(screen.getByRole("button", { name: "Modern text" })).toHaveTextContent("Dojo");

    const name = screen.getByRole("textbox", { name: "What should the app be called?" });
    await user.clear(name);

    expect(screen.getByRole("button", { name: "Modern text" })).toHaveTextContent("Modern");
    expect(screen.getByRole("button", { name: "Friendly headings" })).toHaveTextContent("Friendly");
  });

  it("says when the owner's own color needs a lighter shade for buttons in dark mode", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const code = screen.getByRole("textbox", { name: "Color code" });

    await user.clear(code);
    await user.type(code, "#111111");

    expect(
      screen.getByText("In dark mode, buttons use a slightly lighter shade so they stand out."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/In light mode/)).not.toBeInTheDocument();
  });

  it("offers both letterings under More options", async () => {
    serve();
    const { user } = show();

    await user.click(await screen.findByRole("button", { name: "Extra rounded" }));
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Classic headings" }));
    await user.click(screen.getByRole("button", { name: "Modern text" }));

    expect(shown()).toMatch(/^gray extra-round classic modern /);
  });

  it("marks only the look in use as pressed, and none once one thing differs", async () => {
    serve();
    const { user } = show();
    const pressed = () =>
      ["Clean", "Friendly", "Bold", "Calm", "Classic"].filter(
        (name) => screen.getByRole("button", { name }).getAttribute("aria-pressed") === "true",
      );
    await screen.findByRole("button", { name: "Clean" });
    expect(pressed()).toEqual(["Clean"]);

    for (const [name, expected] of [
      ["Friendly", "Friendly"],
      ["Bold", "Bold"],
      ["Calm", "Calm"],
      ["Classic", "Classic"],
      ["Clean", "Clean"],
    ] as const) {
      await user.click(screen.getByRole("button", { name }));
      expect(pressed()).toEqual([expected]);
    }

    await user.click(screen.getByRole("button", { name: "Teal" }));
    expect(pressed()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Clean" }));
    await user.click(screen.getByRole("button", { name: "Square" }));
    expect(pressed()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Clean" }));
    await user.click(screen.getByRole("button", { name: "More options" }));
    await user.click(screen.getByRole("button", { name: "Modern headings" }));
    expect(pressed()).toEqual([]);
    await user.click(screen.getByRole("button", { name: "Clean" }));
    await user.click(screen.getByRole("button", { name: "Modern text" }));
    expect(pressed()).toEqual([]);
    // About twenty clicks through the whole form: more than the default 5 s on a slow CI runner.
  }, 20_000);

  it("offers every palette but the owner's own as a swatch, and presses only the one in use", async () => {
    serve();
    const { user } = show();
    await screen.findByRole("button", { name: "Gray" });
    const swatches = ["Gray", "Red", "Orange", "Yellow", "Green", "Teal", "Blue", "Cyan", "Purple", "Pink"];

    expect(screen.queryByRole("button", { name: "Brand" })).not.toBeInTheDocument();
    for (const name of swatches) {
      expect(screen.getByRole("button", { name }), name).toHaveAttribute("aria-pressed", String(name === "Gray"));
    }
    await user.click(screen.getByRole("button", { name: "Pink" }));
    expect(screen.getByRole("button", { name: "Pink" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Gray" })).toHaveAttribute("aria-pressed", "false");
  });

  it("offers all five shapes, named, from square to extra rounded, without More options", async () => {
    serve();
    show();
    await screen.findByRole("button", { name: "Rounded" });

    const names = ["Square", "Slightly rounded", "Rounded", "Very rounded", "Extra rounded"];
    const shapes = screen.getAllByRole("button").filter((b) => names.includes(b.textContent));
    expect(shapes.map((b) => b.textContent)).toEqual(names);
    for (const button of shapes) {
      expect(button).toHaveAttribute("aria-pressed", String(button.textContent === "Rounded"));
    }
    expect(screen.getByRole("button", { name: "More options" })).toHaveAttribute("aria-expanded", "false");
  });

  it("offers flat and raised depth, each with a sample card, and presses the one in use", async () => {
    serve();
    const { user } = show();
    const flat = await screen.findByRole("button", { name: "Flat" });
    const raised = screen.getByRole("button", { name: "Raised" });

    expect(flat).toHaveAttribute("aria-pressed", "true");
    expect(raised).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("heading", { name: "Depth" })).toHaveProperty("tagName", "H4");
    expect(screen.getByRole("region", { name: "Depth" })).toContainElement(flat);
    const sample = (button: HTMLElement) => button.querySelector<HTMLElement>("[data-sample]")!;
    expect(sample(flat)).toHaveAttribute("data-sample", "flat");
    expect(rulesFor(sample(flat))).toMatch(/border-width:1px/);
    expect(rulesFor(sample(flat))).not.toMatch(/box-shadow/);
    expect(rulesFor(sample(flat))).toMatch(/border-color:var\(--chakra-colors-border\)/);
    expect(sample(raised)).toHaveAttribute("data-sample", "raised");
    expect(rulesFor(sample(raised))).toMatch(/box-shadow:var\(--chakra-shadows-sm\)/);
    expect(rulesFor(sample(raised))).toMatch(/border-color:var\(--chakra-colors-border-muted\)/);
    expect(rulesFor(raised.querySelector<HTMLElement>("[data-swatch]")!)).toMatch(/background:/);

    await user.click(raised);

    expect(shownDepth()).toBe("raised");
    expect(raised).toHaveAttribute("aria-pressed", "true");
    expect(flat).toHaveAttribute("aria-pressed", "false");
    await user.click(flat);
    expect(shownDepth()).toBe("flat");
  });

  it("draws the raised sample as the real raised page and card, in light and dark", async () => {
    serve();
    show();
    const raised = await screen.findByRole("button", { name: "Raised" });
    const page = rulesFor(raised.querySelector<HTMLElement>("[data-swatch]")!);
    const card = rulesFor(raised.querySelector<HTMLElement>("[data-sample]")!);
    expect(page).toMatch(/background:var\(--chakra-colors-gray-100\)/);
    expect(page).toMatch(/\.dark[^{]*\{[^}]*background:var\(--chakra-colors-black\)/);
    expect(card).toMatch(/background:var\(--chakra-colors-white\)/);
    expect(card).toMatch(/\.dark[^{]*\{[^}]*background:var\(--chakra-colors-gray-950\)/);
  });

  it("sets the depth with a ready-made look, and presses a look only at its depth", async () => {
    serve();
    const { user } = show();

    await user.click(await screen.findByRole("button", { name: "Friendly" }));
    expect(shownDepth()).toBe("raised");
    expect(screen.getByRole("button", { name: "Friendly" })).toHaveAttribute("aria-pressed", "true");

    await user.click(screen.getByRole("button", { name: "Flat" }));
    expect(screen.getByRole("button", { name: "Friendly" })).toHaveAttribute("aria-pressed", "false");
    await user.click(screen.getByRole("button", { name: "Clean" }));
    expect(shownDepth()).toBe("flat");
  });

  it("names each lettering and presses the one in use", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));

    for (const suffix of ["headings", "text"]) {
      for (const label of ["Plain", "Modern", "Friendly", "Classic"]) {
        expect(screen.getByRole("button", { name: `${label} ${suffix}` }), `${label} ${suffix}`).toHaveAttribute(
          "aria-pressed",
          String(label === "Plain"),
        );
      }
    }
    await user.click(screen.getByRole("button", { name: "Friendly text" }));
    expect(screen.getByRole("button", { name: "Friendly text" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Plain text" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByRole("button", { name: "Plain headings" })).toHaveAttribute("aria-pressed", "true");
  });

  it("falls back to the lettering's name when the app's name is only spaces", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const name = screen.getByRole("textbox", { name: "What should the app be called?" });

    await user.clear(name);
    await user.type(name, "   ");

    expect(screen.getByRole("button", { name: "Classic text" })).toHaveTextContent("Classic");
  });

  it("ignores a color code with anything around the six digits", async () => {
    serve();
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    const code = screen.getByRole("textbox", { name: "Color code" });

    fireEvent.change(code, { target: { value: "x#ff8800" } });
    expect(shown()).toMatch(/^gray /);
    fireEvent.change(code, { target: { value: "#ff88001" } });
    expect(shown()).toMatch(/^gray /);
    fireEvent.change(code, { target: { value: "#ff8800" } });
    expect(shown()).toMatch(/^brand /);
  });

  it("saves a typed color code in lower case, and the picker's color as chosen", async () => {
    const { saves } = serve();
    const { user, container } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));
    // One change, not seven keystrokes: each keystroke renders the whole page again, slow under jsdom.
    fireEvent.change(screen.getByRole("textbox", { name: "Color code" }), { target: { value: "#FF8800" } });
    await user.click(screen.getByRole("button", { name: "Save" }));
    await screen.findByText("The new look is saved");

    expect(saves[0]).toMatchObject({ palette: "brand", brandColor: "#ff8800" });
    expect(screen.getByRole("textbox", { name: "Color code" })).toHaveValue("#FF8800");

    fireEvent.change(container.querySelector("input[type=color]")!, { target: { value: "#00ff00" } });
    expect(container.querySelector<HTMLInputElement>("input[type=color]")!.value).toBe("#00ff00");
    expect(screen.getByRole("textbox", { name: "Color code" })).toHaveValue("#00ff00");
  });

  it("says when putting the look back failed", async () => {
    let saved = 0;
    serve((body) => (saved++ === 0 ? HttpResponse.json({ ...body, version: body.version + 1 }) : stale()));
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "Bold" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await user.click(await screen.findByRole("button", { name: "Undo" }));

    expect(await screen.findByText("Could not put the look back")).toBeInTheDocument();
  });

  it("does not offer the buttons' shade note for a color the owner has not chosen", async () => {
    server.use(http.get("/api/roux/theme", () => HttpResponse.json({ ...SAVED, brandColor: "#fff59d" })));
    const { user } = show();
    await user.click(await screen.findByRole("button", { name: "More options" }));

    expect(screen.queryByText(/buttons use a slightly/)).not.toBeInTheDocument();
  });

  it("fills a pressed option with the palette's color, and rings a pressed swatch", async () => {
    serve();
    show();
    const rounded = await screen.findByRole("button", { name: "Rounded" });
    const gray = screen.getByRole("button", { name: "Gray" });
    const rules = Array.from(document.querySelectorAll("style"))
      .map((style) => style.textContent)
      .join("\n");
    /** What the styles say of `element` while it is pressed. */
    const whenPressed = (element: HTMLElement) =>
      Array.from(element.classList)
        .flatMap((name) => [...rules.matchAll(new RegExp(`\\.${name}[^{}]*aria-pressed=true[^{}]*\\{([^}]*)\\}`, "g"))])
        .map((match) => match[1])
        .join(";");

    expect(whenPressed(rounded)).toContain("background:var(--chakra-colors-color-palette-solid)");
    expect(whenPressed(rounded)).toContain("color:var(--chakra-colors-color-palette-contrast)");
    expect(whenPressed(gray)).toContain("outline:2px solid");
    expect(whenPressed(gray)).toContain("outline-color:var(--chakra-colors-color-palette-solid)");
  });

  it("rings the look in use in the palette's color", async () => {
    serve();
    show();
    const clean = await screen.findByRole("button", { name: "Clean" });

    expect(rulesFor(clean)).toMatch(
      /aria-pressed=true[^{}]*\{[^}]*border-color:var\(--chakra-colors-color-palette-solid\)/,
    );
    expect(rulesFor(clean)).toMatch(/aria-pressed=true[^{}]*\{[^}]*outline:1px solid/);
    expect(rulesFor(clean)).toMatch(
      /aria-pressed=true[^{}]*\{[^}]*outline-color:var\(--chakra-colors-color-palette-solid\)/,
    );
  });

  it("names the app first, then the look, each with a line on what it is for", async () => {
    serve();
    show();
    await screen.findByRole("button", { name: "Clean" });

    expect(screen.getAllByRole("heading").map((heading) => heading.textContent)).toEqual([
      "Name",
      "Look",
      "Color",
      "Shape",
      "Depth",
    ]);
    expect(screen.getByRole("heading", { name: "Name" })).toHaveProperty("tagName", "H3");
    expect(screen.getByRole("heading", { name: "Color" })).toHaveProperty("tagName", "H4");
    const name = screen.getByRole("region", { name: "Name" });
    expect(name).toHaveTextContent("What people see in the header, the browser tab and emails.");
    expect(name).toContainElement(screen.getByRole("textbox", { name: "What should the app be called?" }));
    const look = screen.getByRole("region", { name: "Look" });
    expect(look).toHaveTextContent("Start from a ready-made look, then adjust the color and shape.");
    expect(look).toContainElement(screen.getByRole("button", { name: "Clean" }));
    expect(look).toContainElement(screen.getByRole("button", { name: "More options" }));
    expect(screen.getByRole("separator")).toBeInTheDocument();
  });

  it("lays the looks out three to a row on a phone and five from md", async () => {
    serve();
    show();
    const grid = (await screen.findByRole("button", { name: "Clean" })).parentElement!;

    expect(rulesFor(grid)).toMatch(/grid-template-columns:repeat\(3, minmax\(0, 1fr\)\)/);
    expect(rulesFor(grid)).toMatch(/min-width: 48rem\)[^}]*grid-template-columns:repeat\(5, minmax\(0, 1fr\)\)/);
  });

  it("shows More options as a tinted button that opens the extra options, its chevron turned when open", async () => {
    serve();
    const { user } = show();
    const more = await screen.findByRole("button", { name: "More options" });
    const chevron = more.querySelector<HTMLElement>("[data-part=indicator]")!;

    // Filled with the palette's subtle tint, so it stands apart from the outlined shapes above it.
    expect(rulesFor(more)).toMatch(/background:var\(--chakra-colors-color-palette-subtle\)/);
    expect(rulesFor(chevron)).toMatch(/\[data-state=open\][^{}]*\{[^}]*transform:rotate\(180deg\)/);
    expect(chevron).toHaveAttribute("data-state", "closed");
    expect(screen.queryByRole("textbox", { name: "Color code" })).not.toBeInTheDocument();

    await user.click(more);

    expect(more).toHaveAttribute("aria-expanded", "true");
    expect(chevron).toHaveAttribute("data-state", "open");
    const extra = document.getElementById(more.getAttribute("aria-controls")!)!;
    expect(extra).toContainElement(screen.getByRole("textbox", { name: "Color code" }));
  });
});
