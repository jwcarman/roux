import { Heading, Stack } from "@chakra-ui/react";
import { EmailSignIn, PasskeySignInButton, ProviderSignInButtons } from "@jwcarman/roux-web/signin";

/** The sign-in page: roux's pieces, in the order this app wants them. Its own to change. */
export function SignIn() {
  return (
    <Stack gap="6">
      <Heading as="h2">Sign in</Heading>
      <EmailSignIn />
      <PasskeySignInButton />
      <ProviderSignInButtons />
    </Stack>
  );
}
