import { Button, Stack, Text, type ButtonProps } from "@chakra-ui/react";
import { useState } from "react";
import { useSignInReturn } from "./returnTo";
import { who } from "./who";

/**
 * Signing in with a passkey the browser holds: `signIn` asks for one, then goes where the visitor was
 * going; `error` is the refusal to tell, or null.
 */
export function usePasskeySignIn() {
  const finish = useSignInReturn();
  const [error, setError] = useState<string | null>(null);

  async function signIn() {
    setError(null);
    try {
      const result = await who.passkeys.signIn();
      if (result.ok) {
        finish();
      } else {
        setError(result.reason === "cancelled" ? "Passkey sign-in was cancelled." : "Passkey sign-in failed.");
      }
    } catch {
      setError("Passkey sign-in failed.");
    }
  }

  return { signIn, error };
}

/** Signs in with a passkey the browser holds, then goes where the visitor was going. A refusal is told under the button. */
export function PasskeySignInButton(props: Omit<ButtonProps, "onClick" | "children">) {
  const { signIn, error } = usePasskeySignIn();

  return (
    <Stack gap="2">
      <Button variant="outline" {...props} onClick={() => void signIn()}>
        Sign in with a passkey
      </Button>
      {error !== null && (
        <Text role="alert" color="fg.error">
          {error}
        </Text>
      )}
    </Stack>
  );
}
