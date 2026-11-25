import { Button, Stack, type ButtonProps } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { FaApple, FaGithub, FaGitlab } from "react-icons/fa6";
import { LuLogIn } from "react-icons/lu";
import { SiOkta } from "react-icons/si";
import { useSignInOptions } from "./options";
import { auth } from "./auth";

/** A button's colors in one color mode. */
interface Palette {
  bg: string;
  color: string;
  border: string;
}

interface Brand {
  name: string;
  icon: ReactNode;
  light: Palette;
  dark: Palette;
}

/** Google's "G", in the four colors Google's guidelines give it (never recolored). */
function GoogleLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 48 48">
      <path
        fill="#ea4335"
        d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"
      />
      <path
        fill="#4285f4"
        d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"
      />
      <path
        fill="#fbbc05"
        d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"
      />
      <path
        fill="#34a853"
        d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"
      />
    </svg>
  );
}

/** Microsoft's four squares, which its guidelines say to draw in these colors. */
function MicrosoftLogo() {
  return (
    <svg aria-hidden="true" width="18" height="18" viewBox="0 0 21 21">
      <rect x="1" y="1" width="9" height="9" fill="#f25022" />
      <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
      <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
      <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
    </svg>
  );
}

/*
 * Each provider's button as its own published guidance draws it, so a person recognises it:
 * Google (developers.google.com/identity/branding-guidelines): the four-color "G" at 18px on a white
 * button with a #747775 outline and #1F1F1F text, or #131314 with a #8E918F outline and #E3E3E3 text
 * in the dark theme, 40px tall, "Continue with Google". Microsoft: its four squares on white with a
 * #8C8C8C outline and #5E5E5E text, or on #2F2F2F with white text. Apple: its mark on a black button
 * with white text, or a white one with black text. GitHub, GitLab and Okta publish no button: their
 * own marks in their own colors on a plain button.
 */
const BRANDS: Record<string, Brand> = {
  google: {
    name: "Google",
    icon: <GoogleLogo />,
    light: { bg: "#ffffff", color: "#1f1f1f", border: "#747775" },
    dark: { bg: "#131314", color: "#e3e3e3", border: "#8e918f" },
  },
  microsoft: {
    name: "Microsoft",
    icon: <MicrosoftLogo />,
    light: { bg: "#ffffff", color: "#5e5e5e", border: "#8c8c8c" },
    dark: { bg: "#2f2f2f", color: "#ffffff", border: "#2f2f2f" },
  },
  apple: {
    name: "Apple",
    icon: <FaApple size={18} />,
    light: { bg: "#000000", color: "#ffffff", border: "#000000" },
    dark: { bg: "#ffffff", color: "#000000", border: "#ffffff" },
  },
  github: {
    name: "GitHub",
    icon: <FaGithub size={18} />,
    light: { bg: "#24292f", color: "#ffffff", border: "#24292f" },
    dark: { bg: "#f6f8fa", color: "#24292f", border: "#f6f8fa" },
  },
  gitlab: {
    name: "GitLab",
    icon: <FaGitlab size={18} color="#fc6d26" />,
    light: { bg: "#ffffff", color: "#1f1f1f", border: "#747775" },
    dark: { bg: "#1f1f1f", color: "#ffffff", border: "#8e918f" },
  },
  okta: {
    name: "Okta",
    icon: <SiOkta size={18} />,
    light: { bg: "#007dc1", color: "#ffffff", border: "#007dc1" },
    dark: { bg: "#007dc1", color: "#ffffff", border: "#007dc1" },
  },
};

/** A provider roux does not know: a neutral button. */
const GENERIC: Pick<Brand, "light" | "dark"> = {
  light: { bg: "#ffffff", color: "#1f1f1f", border: "#747775" },
  dark: { bg: "#131314", color: "#e3e3e3", border: "#8e918f" },
};

export interface ProviderSignInButtonProps extends Omit<ButtonProps, "children" | "asChild" | "label"> {
  /** The provider's id as who reports it (`google`, `microsoft`, `github`, `apple`, `gitlab`, `okta`, or any other registration). */
  provider: string;
  /** The provider's display name, as who reports it; used for a provider roux does not know. Defaults to the id. */
  name?: string;
  /** The button's text, instead of `Continue with <name>`. */
  label?: string;
  /** The button's icon, instead of the provider's own (or the generic one). */
  icon?: ReactNode;
}

/**
 * A "Continue with Google" button for one OIDC provider: a link (a full page load, because the
 * provider's own sign-in page has to open) to who's authorize URL, drawn as that provider's
 * published guidance asks, in the visitor's light or dark mode. A provider roux does not know gets a
 * generic icon and its display name (`name`, which `ProviderSignInButtons` passes from who). `icon`
 * and `label` override. Usable on its own, on a sign-in page that lays out its own buttons.
 */
export function ProviderSignInButton({ provider, name, label, icon, ...props }: ProviderSignInButtonProps) {
  const brand = BRANDS[provider.toLowerCase()];
  const look = brand ?? GENERIC;
  const style = (palette: Palette) => ({ bg: palette.bg, color: palette.color, borderColor: palette.border });
  return (
    <Button
      asChild
      variant="outline"
      height="10"
      gap="2.5"
      fontWeight="medium"
      {...style(look.light)}
      _dark={style(look.dark)}
      _hover={{ opacity: 0.9 }}
      {...props}
    >
      <a href={auth.oidc.authorizeUrl(provider)}>
        {icon ?? brand?.icon ?? <LuLogIn size={18} />}
        {label ?? `Continue with ${brand?.name ?? name ?? provider}`}
      </a>
    </Button>
  );
}

/**
 * One `ProviderSignInButton` for each provider the server reports as on (`auth.signInOptions()`), in who's
 * order and with who's display names; nothing when there are none, or while they load.
 */
export function ProviderSignInButtons() {
  const options = useSignInOptions();

  return (
    <Stack gap="3">
      {options.data?.providers.map((provider) => (
        <ProviderSignInButton key={provider.id} provider={provider.id} name={provider.name} />
      ))}
    </Stack>
  );
}
