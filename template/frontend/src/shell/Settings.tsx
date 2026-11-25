import { Heading, Separator, Stack, Text } from "@chakra-ui/react";
import type { ReactNode } from "react";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { PasskeySettings } from "@jwcarman/roux-web/signin";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import { useSession } from "@jwcarman/roux-web/session";
import { ProfileForm } from "../users/ProfileForm";

/** One part of the page: its title, a line on what it is for, and its contents. */
function Section({
  title,
  description,
  children,
}: Readonly<{
  title: string;
  description: string;
  children: ReactNode;
}>) {
  return (
    <Stack gap="5">
      <Stack gap="1">
        <Heading as="h3" size="md">
          {title}
        </Heading>
        <Text textStyle="sm" color="fg.muted">
          {description}
        </Text>
      </Stack>
      {children}
    </Stack>
  );
}

export function Settings() {
  const { refresh } = useSession();
  const appName = useShellTheme().shown.appName;
  return (
    <Stack gap="8" maxW="xl">
      <PageHeader title="Settings" />
      <Section title="Profile" description={`How you appear to others in ${appName}.`}>
        <ProfileForm />
      </Section>
      <Separator />
      <Section title="Passkeys" description="Sign in with your fingerprint, face or device PIN.">
        {/* who's own: the list, Remove, and Add a passkey; a session that ended is refreshed. */}
        <PasskeySettings onSignedOut={refresh} />
      </Section>
    </Stack>
  );
}
