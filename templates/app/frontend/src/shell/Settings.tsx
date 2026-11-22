import {
  Box,
  Button,
  Flex,
  Heading,
  List,
  Separator,
  Stack,
  Text,
} from "@chakra-ui/react";
import type { ReactNode } from "react";
import { useState } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useAppForm } from "@jwcarman/roux-web/form";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { useShellTheme } from "@jwcarman/roux-web/theme";
import type { Passkey } from "@jwcarman/who-client";
import {
  listPasskeys,
  PASSKEY_LABEL_MAX,
  passkeyLabelError,
  registerPasskey,
  removePasskey,
} from "../users/passkeys";
import { queryKeys } from "../queryKeys";
import { useSession } from "./session";
import { ProfileForm } from "../users/ProfileForm";
import { formatInstantDate } from "@jwcarman/roux-web/dates";

function labelError({ value }: { value: string }) {
  return passkeyLabelError(value);
}

/** The day of a passkey's moment in the organization's zone, or "never". */
function formatUse(value: string | null): string {
  return value ? formatInstantDate(value) : "never";
}

/** One part of the page: its title, a line on what it is for, and its contents. */
function Section({
  title,
  description,
  children,
}: {
  title: string;
  description: string;
  children: ReactNode;
}) {
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

/** Why a passkey was not added, by who's reason; any other reason gets the general message. */
const NOT_ADDED: Partial<Record<string, string>> = {
  cancelled: "Adding the passkey was cancelled.",
  "already-registered": "This device already has a passkey for your account.",
};

export function Settings() {
  const { refresh } = useSession();
  const appName = useShellTheme().shown.appName;
  const [adding, setAdding] = useState(false);
  const passkeys = useQuery({
    queryKey: queryKeys.passkeys,
    // null: they could not be loaded.
    queryFn: async (): Promise<Passkey[] | null> => {
      try {
        const result = await listPasskeys();
        if (result.ok) {
          return result.value;
        }
        if (result.reason === "signed-out") {
          // The session ended (for example, by removing the passkey it signed in with): who's client
          // does not tell the session provider, so ask it, and the guards send the user to sign in.
          await refresh();
          return [];
        }
      } catch {
        // who could not be reached: the same as any other failure.
      }
      return null;
    },
  });
  const register = useMutation({
    mutationFn: (label: string) => registerPasskey(label),
    meta: { refreshes: [queryKeys.passkeys] },
  });
  const remove = useMutation({
    mutationFn: (credentialId: string) => removePasskey(credentialId),
    meta: { refreshes: [queryKeys.passkeys] },
  });

  const addForm = useAppForm({
    defaultValues: { label: "" },
    onSubmit: async ({ value }) => {
      try {
        const result = await register.mutateAsync(value.label.trim());
        if (result.ok) {
          // Closing is enough: the dialog puts the form back once it has closed.
          setAdding(false);
          notify.success("Passkey added");
        } else {
          notify.error(
            NOT_ADDED[result.reason] ??
              "Could not add the passkey. Sign in again and retry.",
          );
        }
      } catch {
        notify.error("Could not add the passkey. Sign in again and retry.");
      }
    },
  });

  async function onRemove(passkey: Passkey) {
    const result = await remove.mutateAsync(passkey.credentialId);
    if (result.ok) {
      notify.success("Passkey removed");
    } else if (result.reason === "signed-out") {
      await refresh();
    } else {
      notify.error(
        result.reason === "last-credential"
          ? "That is your only way to sign in, so it stays."
          : "Could not remove the passkey.",
      );
    }
  }

  return (
    <Stack gap="8" maxW="xl">
      <PageHeader title="Settings" />
      <Section
        title="Profile"
        description={`How you appear to others in ${appName}.`}
      >
        <ProfileForm />
      </Section>
      <Separator />
      <Section
        title="Passkeys"
        description="Sign in with your fingerprint, face or device PIN."
      >
        {passkeys.data === null && (
          <Text role="alert" color="fg.error" textStyle="sm">
            Could not load the passkeys.
          </Text>
        )}
        {passkeys.data?.length === 0 && (
          <Text color="fg.muted" textStyle="sm">
            No passkeys yet.
          </Text>
        )}
        {passkeys.data && passkeys.data.length > 0 && (
          <List.Root aria-label="Passkeys" variant="plain" gap="4">
            {passkeys.data.map((passkey) => (
              <List.Item key={passkey.credentialId}>
                <Flex
                  align="center"
                  justify="space-between"
                  gap="3"
                  width="full"
                >
                  <Box minW="0">
                    <Text textStyle="sm" fontWeight="medium" truncate>
                      {passkey.label}
                    </Text>
                    <Text textStyle="xs" color="fg.muted">
                      Added {formatUse(passkey.createdAt)} · Last used{" "}
                      {formatUse(passkey.lastUsedAt)}
                    </Text>
                  </Box>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Remove ${passkey.label}`}
                    onClick={() => onRemove(passkey)}
                  >
                    Remove
                  </Button>
                </Flex>
              </List.Item>
            ))}
          </List.Root>
        )}
        <FormDialog
          form={addForm}
          title="Add a passkey"
          trigger={
            <Button variant="outline" alignSelf="start">
              Add a passkey
            </Button>
          }
          submitLabel="Add"
          open={adding}
          onOpenChange={setAdding}
        >
          <addForm.AppField
            name="label"
            validators={{ onBlur: labelError, onSubmit: labelError }}
          >
            {(field) => (
              <field.InputField
                label="Passkey label"
                placeholder="Work laptop"
                maxLength={PASSKEY_LABEL_MAX}
              />
            )}
          </addForm.AppField>
        </FormDialog>
      </Section>
    </Stack>
  );
}
