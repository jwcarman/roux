import { chakra, type HTMLChakraProps } from "@chakra-ui/react";

/**
 * The app's monogram, a geometric lowercase n on a rounded square, drawn in the theme's palette so it
 * inverts in dark mode instead of vanishing into a dark sidebar. Decorative: the app's name beside
 * it is what screen readers read. The favicon (public/favicon.svg) is the same mark.
 */
export function Logo(props: HTMLChakraProps<"svg">) {
  return (
    <chakra.svg viewBox="0 0 32 32" boxSize="7" flexShrink="0" aria-hidden focusable="false" {...props}>
      <chakra.rect width="32" height="32" rx="7" fill="colorPalette.solid" />
      <chakra.path
        d="M10 23V15.5a6 6 0 0 1 12 0V23"
        fill="none"
        stroke="colorPalette.contrast"
        strokeWidth="3.6"
        strokeLinecap="round"
      />
    </chakra.svg>
  );
}
