import type { ShellTheme } from "./theme";

/** A ready-made look: a starting point the owner picks on the Appearance page, then may adjust. */
export interface Look {
  name: string;
  settings: Pick<ShellTheme, "palette" | "shape" | "depth" | "headingFont" | "bodyFont">;
}

/** The ready-made looks, in the order the page offers them. Clean is the template's own look. */
export const LOOKS: readonly Look[] = [
  {
    name: "Clean",
    settings: { palette: "gray", shape: "medium", depth: "flat", headingFont: "standard", bodyFont: "standard" },
  },
  {
    name: "Friendly",
    settings: { palette: "teal", shape: "round", depth: "raised", headingFont: "friendly", bodyFont: "friendly" },
  },
  {
    name: "Bold",
    settings: { palette: "purple", shape: "square", depth: "flat", headingFont: "modern", bodyFont: "modern" },
  },
  {
    name: "Calm",
    settings: { palette: "blue", shape: "slight", depth: "raised", headingFont: "standard", bodyFont: "standard" },
  },
  {
    name: "Classic",
    settings: { palette: "green", shape: "slight", depth: "flat", headingFont: "classic", bodyFont: "standard" },
  },
];
