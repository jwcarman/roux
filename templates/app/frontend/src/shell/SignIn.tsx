import { SignInCard } from "@jwcarman/roux-web/signin";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import { Logo } from "./Logo";

/**
 * The sign-in page: roux's `SignInCard`, which offers the ways of signing in who has on. The
 * template turns on an emailed link (or its typed code) and a passkey, the two that need no password
 * and no outside provider; an OIDC provider configured in who shows on the same card.
 */
export function SignIn() {
  const appName = useShellTheme().shown.appName;
  return <SignInCard appName={appName} logo={<Logo boxSize="9" />} />;
}
