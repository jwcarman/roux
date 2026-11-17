// @vitest-environment jsdom
import { act, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { DEFAULT_THEME, type ThemeSettings } from "./theme";
import { ThemeProvider, useTheme, type ThemeState } from "./themeContext";

const SAVED: ThemeSettings = { ...DEFAULT_THEME, appName: "Dojo" };

function show(): { state: () => ThemeState } {
  let current: ThemeState | undefined;
  function Probe() {
    current = useTheme();
    return (
      <p>
        {current.shown.appName} / saved {current.saved.appName}
      </p>
    );
  }
  render(
    <ThemeProvider initial={SAVED}>
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

  it("refuses to be used outside the provider", () => {
    function Lost() {
      useTheme();
      return null;
    }

    expect(() => render(<Lost />)).toThrow("useTheme needs a ThemeProvider");
  });
});
