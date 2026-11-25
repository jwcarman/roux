import { Button, Center, Flex, Heading, Separator, Stack, Text } from "@chakra-ui/react";
import type { SignInOptions } from "../auth";
import { useState, type ReactNode } from "react";
import { LuChevronLeft, LuKeyRound, LuMail } from "react-icons/lu";
import { CodeForm, LinkRequestForm, SEND_FAILED, sendLink } from "./EmailSignIn";
import { useSignInOptions } from "./options";
import { usePasskeySignIn } from "./PasskeySignInButton";
import { ProviderSignInButton } from "./providers";

/** The ways a card offers when the server cannot be asked: the two roux apps have on. */
const FALLBACK: SignInOptions = { email: true, passkey: true, providers: [] };

export interface SignInCardProps {
  /** The app's name: "Sign in to <appName>". */
  appName: string;
  /** The app's logo, above the name. */
  logo?: ReactNode;
}

/**
 * The sign-in card, for `SignInFrame`: the ways of signing in the server reports as on. An emailed link
 * comes first; below a divider, a passkey and each OIDC provider. Once the link is sent the card
 * turns to checking email: the address it went to, the code from the email beside Sign in, a way
 * back to a different address, and sending it again.
 */
export function SignInCard({ appName, logo }: Readonly<SignInCardProps>) {
  const [address, setAddress] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);

  if (sentTo !== null) {
    return <CheckYourEmail email={sentTo} onBack={() => setSentTo(null)} />;
  }
  return (
    <ChooseHow
      appName={appName}
      logo={logo}
      initialEmail={address}
      onSent={(sent) => {
        setAddress(sent);
        setSentTo(sent);
      }}
    />
  );
}

interface ChooseHowProps extends SignInCardProps {
  initialEmail: string;
  onSent: (address: string) => void;
}

function ChooseHow({ appName, logo, initialEmail, onSent }: Readonly<ChooseHowProps>) {
  const options = useSignInOptions();
  const ways = options.isError ? FALLBACK : options.data;

  return (
    <Stack gap="6">
      <Stack gap="4">
        {logo}
        <Stack gap="1">
          <Heading as="h1" size="lg">
            Sign in to {appName}
          </Heading>
          {ways?.email && (
            <Text textStyle="sm" color="fg.muted">
              We'll email you a link to sign in.
            </Text>
          )}
        </Stack>
      </Stack>
      {ways && <Ways ways={ways} initialEmail={initialEmail} onSent={onSent} />}
    </Stack>
  );
}

/** The emailed link, then, below a divider, the other ways who reports. */
function Ways({ ways, initialEmail, onSent }: { ways: SignInOptions } & Omit<ChooseHowProps, keyof SignInCardProps>) {
  const others = ways.passkey || ways.providers.length > 0;
  return (
    <>
      {ways.email && <LinkRequestForm initialEmail={initialEmail} onSent={onSent} />}
      {ways.email && others && <Separator />}
      {others && <OtherWays ways={ways} labelled={ways.email} />}
    </>
  );
}

/**
 * The passkey and the providers. Under an emailed link they are labelled: "Have a passkey?" beside a
 * passkey that is the only other way, "Other ways to sign in" above several.
 */
function OtherWays({ ways, labelled }: Readonly<{ ways: SignInOptions; labelled: boolean }>) {
  const { signIn, error } = usePasskeySignIn();
  const passkey = ways.passkey && (
    <Button variant="outline" onClick={() => void signIn()}>
      <LuKeyRound aria-hidden />
      Use a passkey
    </Button>
  );
  const providers = ways.providers.map((provider) => (
    <ProviderSignInButton key={provider.id} provider={provider.id} name={provider.name} />
  ));

  return (
    <Stack gap="3">
      {labelled && providers.length === 0 ? (
        <Flex justify="space-between" align="center" gap="3">
          <Text textStyle="sm" color="fg.muted">
            Have a passkey?
          </Text>
          {passkey}
        </Flex>
      ) : (
        <>
          {labelled && (
            <Text textStyle="sm" color="fg.muted">
              Other ways to sign in
            </Text>
          )}
          <Flex wrap="wrap" gap="2">
            {passkey}
            {providers}
          </Flex>
        </>
      )}
      {error !== null && (
        <Text role="alert" color="fg.error" textStyle="sm">
          {error}
        </Text>
      )}
    </Stack>
  );
}

/** After the link is sent: where it went, the code, a different address, and sending it again. */
function CheckYourEmail({ email, onBack }: Readonly<{ email: string; onBack: () => void }>) {
  const [again, setAgain] = useState<"sent" | "failed" | null>(null);

  async function sendAgain() {
    setAgain(null);
    setAgain(await sendLink(email));
  }

  return (
    <Stack gap="6">
      <Stack gap="4">
        <Center boxSize="9" rounded="l2" bg="bg.muted">
          <LuMail aria-hidden />
        </Center>
        <Stack gap="1">
          <Heading as="h1" size="lg">
            Check your email
          </Heading>
          <Text role="status" textStyle="sm" color="fg.muted">
            We sent a sign-in link to{" "}
            <Text as="strong" color="fg" fontWeight="semibold">
              {email}
            </Text>
            . Open it on this device, or type the code from the email.
          </Text>
        </Stack>
      </Stack>
      <CodeForm email={email} />
      <Separator />
      <Flex justify="space-between" align="center" gap="3" wrap="wrap">
        <Button variant="plain" size="sm" px="0" onClick={onBack}>
          <LuChevronLeft aria-hidden />
          Use a different email
        </Button>
        <Button variant="plain" size="sm" px="0" onClick={() => void sendAgain()}>
          Send it again
        </Button>
      </Flex>
      {again === "sent" && (
        <Text role="status" textStyle="sm" color="fg.muted">
          We sent another link.
        </Text>
      )}
      {again === "failed" && (
        <Text role="alert" color="fg.error" textStyle="sm">
          {SEND_FAILED}
        </Text>
      )}
    </Stack>
  );
}
