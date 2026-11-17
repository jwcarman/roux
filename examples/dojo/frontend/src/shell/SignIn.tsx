import { Button, Heading, Stack, Text } from "@chakra-ui/react";
import { useRouter } from "@tanstack/react-router";
import { useState } from "react";
import { send } from "@jwcarman/roux-web/api";
import { email, useAppForm } from "@jwcarman/roux-web/form";
import { z } from "zod";
import { signInWithPasskey } from "../members/passkeys";
import { takeReturn } from "./returnTo";
import { useSession } from "./session";

/** The address to email a sign-in link to, in roux's words. */
const linkRequestSchema = z.object({ email: email() });

export function SignIn() {
  const { refresh } = useSession();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onBlur: linkRequestSchema, onSubmit: linkRequestSchema },
    onSubmit: async ({ value }) => {
      setError(null);
      const response = await send("POST", "/who/email/send", value);
      if (response.ok) {
        setSent(true);
      } else {
        setError("Could not send the link. Try again.");
      }
    },
  });

  async function onPasskey() {
    setError(null);
    try {
      if (await signInWithPasskey()) {
        await refresh();
        const returnTo = takeReturn();
        if (returnTo === undefined) {
          await router.navigate({ to: "/" });
        } else {
          router.history.push(returnTo);
        }
      } else {
        setError("Passkey sign-in failed.");
      }
    } catch {
      setError("Passkey sign-in was cancelled.");
    }
  }

  return (
    <Stack gap="6">
      <Heading as="h2">Sign in</Heading>
      <form.AppForm>
        <form.Form>
          <Stack gap="4">
            <form.AppField name="email">
              {(field) => <field.InputField label="Email" type="email" autoComplete="username webauthn" />}
            </form.AppField>
            <form.SubmitButton>Email me a link</form.SubmitButton>
          </Stack>
        </form.Form>
      </form.AppForm>
      {sent && (
        <Text role="status" fontWeight="bold">
          Check your email
        </Text>
      )}
      <Button variant="outline" onClick={onPasskey}>
        Sign in with a passkey
      </Button>
      {error && (
        <Text role="alert" color="fg.error">
          {error}
        </Text>
      )}
    </Stack>
  );
}
