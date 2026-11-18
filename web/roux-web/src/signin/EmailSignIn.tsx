import { Button, Field, Input, Stack, Text } from "@chakra-ui/react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useAppForm } from "../form/form";
import { email } from "../form/rules";
import { useSignInReturn } from "./returnTo";
import { who } from "./who";

/** The address to email a sign-in link to, in roux's words. */
const linkRequestSchema = z.object({ email: email() });

/**
 * Sign-in by email: "Email me a link" for an address, then, with `Check your email`, either open the
 * link or type the code from the same email (`autoComplete="one-time-code"`), which signs in here and
 * goes where the visitor was going. who's refusal of a code is told under the field.
 */
export function EmailSignIn() {
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [sendError, setSendError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: "" },
    validators: { onBlur: linkRequestSchema, onSubmit: linkRequestSchema },
    onSubmit: async ({ value }) => {
      setSendError(null);
      try {
        const result = await who.email.send(value.email);
        if (result.ok) {
          setSentTo(value.email);
        } else {
          setSendError("Could not send the link. Try again.");
        }
      } catch {
        // who answers a server error by throwing.
        setSendError("Could not send the link. Try again.");
      }
    },
  });

  return (
    <Stack gap="6">
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
      {sendError !== null && (
        <Text role="alert" color="fg.error">
          {sendError}
        </Text>
      )}
      {sentTo !== null && (
        <Stack gap="4">
          <Text role="status" fontWeight="bold">
            Check your email
          </Text>
          <Text>Open the link, or type the code from the email.</Text>
          <CodeForm email={sentTo} />
        </Stack>
      )}
    </Stack>
  );
}

const NOT_ACCEPTED = "That code did not work. Check it, or ask for a new email.";

/** The code from the emailed message, for the address it was sent to. */
function CodeForm({ email }: { email: string }) {
  const finish = useSignInReturn();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      const result = await who.email.signIn({ email, code });
      if (result.ok) {
        finish();
      } else {
        setError(NOT_ACCEPTED);
      }
    } catch {
      // who answers a server error by throwing.
      setError(NOT_ACCEPTED);
    }
  }

  return (
    <form onSubmit={(event) => void submit(event)}>
      <Stack gap="4">
        <Field.Root invalid={error !== null}>
          <Field.Label>Code from the email</Field.Label>
          <Input value={code} onChange={(event) => setCode(event.target.value)} autoComplete="one-time-code" />
          <Field.ErrorText>{error}</Field.ErrorText>
        </Field.Root>
        <Button type="submit">Sign in</Button>
      </Stack>
    </form>
  );
}
