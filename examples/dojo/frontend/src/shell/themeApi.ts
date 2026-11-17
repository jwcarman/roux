import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, sendJson } from "@jwcarman/roux-web/api";
import { text } from "@jwcarman/roux-web/form";
import { z } from "zod";
import type { SavedTheme } from "../api";
import { queryKeys } from "../queryKeys";
import { FONTS, PALETTES, SHAPES, type ThemeSettings } from "./theme";

/** ThemeOptions.COLOR: the owner's own color as `#rrggbb`. */
const COLOR = /^#[0-9a-fA-F]{6}$/;

/**
 * ThemeController.Update's rules (without the version). Only the app's name is typed; the rest are
 * set by the page's buttons and color inputs, which offer only what the server's ThemeOptions accept.
 */
export const themeSchema = z.object({
  palette: z.enum(PALETTES),
  brandColor: z.string().regex(COLOR, { error: "Is not in the expected format" }),
  shape: z.enum(SHAPES),
  headingFont: z.enum(FONTS),
  bodyFont: z.enum(FONTS),
  appName: text().max(60),
});

/** `/api/theme`: the app's look and the version to save it at. */
export const themeApi = {
  get: (signal?: AbortSignal) => getJson<SavedTheme>("theme", { signal }),
  update: (theme: SavedTheme) => sendJson<SavedTheme>("PUT", "theme", theme),
};

/** The saved theme. */
export const themeQuery = queryOptions({
  queryKey: queryKeys.theme,
  queryFn: ({ signal }) => themeApi.get(signal),
});

/** Saves the look at the `version` it was read at; a save made since answers 409. */
export const saveTheme = (version: number) =>
  mutationOptions({
    mutationFn: (settings: ThemeSettings) => themeApi.update({ ...settings, version }),
    meta: { refreshes: [queryKeys.theme] },
  });

/** Stores settings at the version given with them: Undo putting an earlier look back. */
export const restoreTheme = mutationOptions({
  mutationFn: (theme: SavedTheme) => themeApi.update(theme),
  meta: { refreshes: [queryKeys.theme] },
});
