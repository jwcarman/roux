import { Button, Heading, Stack, Table, Text } from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { useAppForm } from "@jwcarman/roux-web/form";
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
import { formatDateTime } from "@jwcarman/roux-web/dates";

function labelError({ value }: { value: string }) {
  return passkeyLabelError(value);
}

/** A passkey's moment in the organization's zone, or "Never". */
function formatUse(value: string | null): string {
  return value ? formatDateTime(value) : "Never";
}

/** Why a passkey was not added, by who's reason; any other reason gets the general message. */
const NOT_ADDED: Partial<Record<string, string>> = {
  cancelled: "Adding the passkey was cancelled.",
  "already-registered": "This device already has a passkey for your account.",
};

export function Settings() {
  const { refresh } = useSession();
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
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await register.mutateAsync(value.label.trim());
        if (result.ok) {
          formApi.reset();
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
    <Stack gap="6">
      <Heading as="h2">Settings</Heading>
      <ProfileForm />
      <Heading as="h3" size="md">
        Passkeys
      </Heading>
      <addForm.AppForm>
        <addForm.Form>
          <Stack gap="4">
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
            <addForm.SubmitButton>Add a passkey</addForm.SubmitButton>
          </Stack>
        </addForm.Form>
      </addForm.AppForm>
      {passkeys.data === null && (
        <Text role="alert" color="fg.error">
          Could not load the passkeys.
        </Text>
      )}
      {passkeys.data?.length === 0 && (
        <Text color="fg.muted">No passkeys yet.</Text>
      )}
      {passkeys.data && passkeys.data.length > 0 && (
        <Table.Root aria-label="Passkeys">
          <Table.Header>
            <Table.Row>
              <Table.ColumnHeader>Label</Table.ColumnHeader>
              <Table.ColumnHeader>Created</Table.ColumnHeader>
              <Table.ColumnHeader>Last used</Table.ColumnHeader>
              <Table.ColumnHeader />
            </Table.Row>
          </Table.Header>
          <Table.Body>
            {passkeys.data.map((passkey) => (
              <Table.Row key={passkey.credentialId}>
                <Table.Cell>{passkey.label}</Table.Cell>
                <Table.Cell>{formatUse(passkey.createdAt)}</Table.Cell>
                <Table.Cell>{formatUse(passkey.lastUsedAt)}</Table.Cell>
                <Table.Cell>
                  <Button
                    size="xs"
                    variant="outline"
                    aria-label={`Remove ${passkey.label}`}
                    onClick={() => onRemove(passkey)}
                  >
                    Remove
                  </Button>
                </Table.Cell>
              </Table.Row>
            ))}
          </Table.Body>
        </Table.Root>
      )}
    </Stack>
  );
}
