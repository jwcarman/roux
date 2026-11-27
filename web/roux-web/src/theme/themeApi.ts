import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, sendJson } from "../api/client";
import { text } from "../form/rules";
import { z } from "zod";
import { FONTS } from "./fonts";
import { DEPTHS, PALETTES, SHAPES, type ShellTheme } from "./theme";

/** The theme as `/api/roux/theme` answers it: the settings and the version to save them at. */
export type SavedTheme = ShellTheme & { version: number };

/** The key the saved theme is cached under, and what a save refreshes. */
const themeKey = ["roux", "theme"] as const;

/**
 * `ThemeRequest`'s rules (without the version). Only the app's name is typed; the rest are set by
 * the page's buttons and color inputs, which offer only what the server accepts.
 */
export const themeSchema = z.object({
  palette: z.enum(PALETTES),
  brandColor: z.string().regex(/^#[0-9a-fA-F]{6}$/, { error: "Is not in the expected format" }),
  shape: z.enum(SHAPES),
  depth: z.enum(DEPTHS),
  headingFont: z.enum(FONTS),
  bodyFont: z.enum(FONTS),
  appName: text().max(60),
});

/** `/api/roux/theme`: the app's look and the version to save it at. */
export const themeApi = {
  get: (signal?: AbortSignal) => getJson<SavedTheme>("roux/theme", { signal }),
  update: (theme: SavedTheme) => sendJson<SavedTheme>("PUT", "roux/theme", theme),
};

/** The saved theme. */
export const themeQuery = queryOptions({
  queryKey: themeKey,
  queryFn: ({ signal }) => themeApi.get(signal),
});

/** Saves the look at the `version` it was read at; a save made since answers 409. */
export const saveTheme = (version: number) =>
  mutationOptions({
    mutationFn: (settings: z.output<typeof themeSchema>) => themeApi.update({ ...settings, version }),
    meta: { refreshes: [themeKey] },
  });

/** Stores settings at the version given with them: Undo putting an earlier look back. */
export const restoreTheme = mutationOptions({
  mutationFn: (theme: SavedTheme) => themeApi.update(theme),
  meta: { refreshes: [themeKey] },
});
