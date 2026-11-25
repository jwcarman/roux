// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { expect, it, vi } from "vitest";
import { createQueryClient } from "../api/queryClient";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { AppearanceSettings } from "./AppearanceSettings";
import { ThemeProvider } from "./ThemeProvider";
import { DEFAULT_THEME } from "./theme";

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

// Alone in its file: a font's stylesheet is imported once per module registry, so only the first
// test to render the page can see which fonts the page asks for.
it("loads every font, so the looks and lettering samples show in them", async () => {
  server.use(http.get("/api/roux/theme", () => HttpResponse.json({ ...DEFAULT_THEME, version: 0 })));
  renderWithProviders(
    <ThemeProvider theme={DEFAULT_THEME}>
      <AppearanceSettings />
    </ThemeProvider>,
    createQueryClient(),
  );
  await screen.findByRole("textbox", { name: "What should the app be called?" });

  await vi.waitFor(() => expect([...fonts.loaded].sort()).toEqual(["inter", "lora", "nunito"]));
});
