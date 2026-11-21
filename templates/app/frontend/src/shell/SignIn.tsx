import { Heading, Stack } from "@chakra-ui/react";
import { EmailSignIn, PasskeySignInButton } from "@jwcarman/roux-web/signin";

/**
 * The sign-in page: an emailed link (or its typed code) and a passkey, the two ways that need no
 * password and no outside provider. Its own to change: roux-web's `ProviderSignInButtons` adds the
 * OIDC providers who is configured with.
 */
export function SignIn() {
  return (
    <Stack gap="6">
      <Heading as="h2">Sign in</Heading>
      <EmailSignIn />
      <PasskeySignInButton />
    </Stack>
  );
}
