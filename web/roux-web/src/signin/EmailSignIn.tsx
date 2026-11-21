import { Button, Field, Flex, Input, Stack, Text } from "@chakra-ui/react";
import { useState, type FormEvent } from "react";
import { z } from "zod";
import { useAppForm } from "../form/form";
import { email } from "../form/rules";
import { useSignInReturn } from "./returnTo";
import { who } from "./who";

/** The address to email a sign-in link to, in roux's words. */
const linkRequestSchema = z.object({ email: email() });

/** What a visitor is told when who could not email the link. */
export const SEND_FAILED = "Could not send the link. Try again.";

/** Asks who to email a sign-in link and code to `address`: "sent" when it did, else "failed". */
export async function sendLink(address: string): Promise<"sent" | "failed"> {
  try {
    return (await who.email.send(address)).ok ? "sent" : "failed";
  } catch {
    // who answers a server error by throwing.
    return "failed";
  }
}

/**
 * Sign-in by email: "Email me a link" for an address, then, with `Check your email`, either open the
 * link or type the code from the same email (`autoComplete="one-time-code"`), which signs in here and
 * goes where the visitor was going. who's refusal of a code is told under the field.
 */
export function EmailSignIn() {
  const [sentTo, setSentTo] = useState<string | null>(null);

  return (
    <Stack gap="6">
      <LinkRequestForm initialEmail="" onSent={setSentTo} />
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

export interface LinkRequestFormProps {
  /** The address the field starts with. */
  initialEmail: string;
  /** Called with the address once who has emailed it. */
  onSent: (address: string) => void;
}

/** The address field and "Email me a link"; a send that fails is told under it. */
export function LinkRequestForm({ initialEmail, onSent }: LinkRequestFormProps) {
  const [sendError, setSendError] = useState<string | null>(null);

  const form = useAppForm({
    defaultValues: { email: initialEmail },
    validators: { onBlur: linkRequestSchema, onSubmit: linkRequestSchema },
    onSubmit: async ({ value }) => {
      setSendError(null);
      if ((await sendLink(value.email)) === "sent") {
        onSent(value.email);
      } else {
        setSendError(SEND_FAILED);
      }
    },
  });

  return (
    <Stack gap="3">
      <form.AppForm>
        <form.Form>
          <Stack gap="3">
            <form.AppField name="email">
              {(field) => <field.InputField label="Email" type="email" autoComplete="username webauthn" />}
            </form.AppField>
            <Flex justify="flex-end">
              <form.SubmitButton>Email me a link</form.SubmitButton>
            </Flex>
          </Stack>
        </form.Form>
      </form.AppForm>
      {sendError !== null && (
        <Text role="alert" color="fg.error" textStyle="sm">
          {sendError}
        </Text>
      )}
    </Stack>
  );
}

const NOT_ACCEPTED = "That code did not work. Check it, or ask for a new email.";

/** The code from the emailed message, for the address it was sent to: a short field with Sign in beside it. */
export function CodeForm({ email }: { email: string }) {
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
      <Field.Root invalid={error !== null}>
        <Field.Label>Code from the email</Field.Label>
        <Flex gap="2" align="center">
          <Input
            value={code}
            onChange={(event) => setCode(event.target.value)}
            autoComplete="one-time-code"
            maxW="10rem"
            letterSpacing="wider"
          />
          <Button type="submit">Sign in</Button>
        </Flex>
        <Field.ErrorText>{error}</Field.ErrorText>
      </Field.Root>
    </form>
  );
}
