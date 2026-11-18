// @vitest-environment jsdom
import { Box } from "@chakra-ui/react";
import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_THEME, type ShellTheme } from "./theme";
import { ThemeProvider, useShellTheme, type ShellThemeState } from "./ThemeProvider";

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

const css = () =>
  Array.from(document.querySelectorAll("style"))
    .map((style) => style.textContent)
    .join("\n");

const SAVED: ShellTheme = { ...DEFAULT_THEME, appName: "Dojo" };

function show(theme: ShellTheme = SAVED): { state: () => ShellThemeState } {
  let current: ShellThemeState | undefined;
  function Probe() {
    current = useShellTheme();
    return (
      <p>
        {current.shown.appName} / saved {current.saved.appName}
      </p>
    );
  }
  render(
    <ThemeProvider theme={theme}>
      <Probe />
    </ThemeProvider>,
  );
  return { state: () => current! };
}

describe("ThemeProvider", () => {
  it("shows the saved theme", () => {
    show();

    expect(screen.getByText("Dojo / saved Dojo")).toBeInTheDocument();
    expect(document.title).toBe("Dojo");
  });

  it("shows a draft without saving it", () => {
    const { state } = show();

    act(() => state().preview({ ...SAVED, appName: "Draft" }));

    expect(screen.getByText("Draft / saved Dojo")).toBeInTheDocument();
    expect(document.title).toBe("Draft");
  });

  it("goes back to the saved theme when the draft is dropped", () => {
    const { state } = show();
    act(() => state().preview({ ...SAVED, appName: "Draft" }));

    act(() => state().preview(null));

    expect(screen.getByText("Dojo / saved Dojo")).toBeInTheDocument();
  });

  it("keeps a committed theme as the saved one", () => {
    const { state } = show();
    act(() => state().preview({ ...SAVED, appName: "Draft" }));

    act(() => state().commit({ ...SAVED, appName: "Kicks" }));

    expect(screen.getByText("Kicks / saved Kicks")).toBeInTheDocument();
    expect(document.title).toBe("Kicks");
  });

  it("starts from the theme the server wrote into the page", () => {
    document.head.innerHTML =
      '<script type="application/json" id="app-theme">{"appName":"From page","palette":"teal","brandColor":"#3b82f6","shape":"medium","headingFont":"standard","bodyFont":"standard"}</script>';
    let current: ShellThemeState | undefined;
    function Probe() {
      current = useShellTheme();
      return null;
    }

    render(
      <ThemeProvider>
        <Probe />
      </ThemeProvider>,
    );

    expect(current?.saved).toMatchObject({ appName: "From page", palette: "teal" });
    expect(document.title).toBe("From page");
    document.head.innerHTML = "";
  });

  it("styles with Emotion under the page's nonce", () => {
    document.head.innerHTML = '<meta property="csp-nonce" nonce="abc123">';
    function Styled() {
      return <Box bg="red.500">styled</Box>;
    }

    render(
      <ThemeProvider theme={SAVED}>
        <Styled />
      </ThemeProvider>,
    );

    const styles = Array.from(document.querySelectorAll("style[data-emotion]"));
    expect(styles.length).toBeGreaterThan(0);
    expect(styles.every((style) => style.getAttribute("nonce") === "abc123")).toBe(true);
    document.head.innerHTML = "";
  });

  it("refuses to be used outside the provider", () => {
    function Lost() {
      useShellTheme();
      return null;
    }

    expect(() => render(<Lost />)).toThrow("useShellTheme needs a ThemeProvider");
  });

  describe("the Chakra system", () => {
    it("follows the shown theme: a previewed shape reaches the styles", () => {
      const { state } = show();
      expect(css()).toContain("--chakra-radii-l2:0.25rem");

      act(() => state().preview({ ...SAVED, shape: "extra-round" }));

      expect(css()).toContain("--chakra-radii-l2:0.75rem");
    });
  });

  describe("the fonts", () => {
    beforeEach(() => {
      fonts.loaded.length = 0;
    });

    it("loads what the theme letters in, and nothing else", async () => {
      show({ ...SAVED, headingFont: "friendly", bodyFont: "standard" });

      await vi.waitFor(() => expect(fonts.loaded).toEqual(["nunito"]));
    });

    it("loads the font of a draft when it is previewed", async () => {
      const { state } = show({ ...SAVED, headingFont: "standard", bodyFont: "standard" });
      expect(fonts.loaded).toEqual([]);

      act(() => state().preview({ ...SAVED, headingFont: "classic", bodyFont: "modern" }));

      await vi.waitFor(() => expect([...fonts.loaded].sort()).toEqual(["inter", "lora"]));
    });
  });
});
