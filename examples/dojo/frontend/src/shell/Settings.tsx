import { Button, Heading, Stack, Table, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { notify } from "@jwcarman/roux-web/feedback";
import { useAppForm } from "@jwcarman/roux-web/form";
import type { Passkey } from "@jwcarman/who-client";
import { listPasskeys, registerPasskey, removePasskey } from "../members/passkeys";
import { useSession } from "./session";
import { ProfileForm } from "../members/ProfileForm";

function labelError({ value }: { value: string }) {
  return value.trim() ? undefined : "Name this passkey, such as the device it is on";
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function Settings() {
  const { me, refresh } = useSession();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await listPasskeys();
      if (result.ok) {
        setPasskeys(result.value);
      } else if (result.reason === "signed-out") {
        // The session ended (for example, by removing the passkey it signed in with): who's client
        // does not tell the session provider, so ask it, and it sends the user to sign in.
        await refresh();
      } else {
        setLoadFailed(true);
      }
    } catch {
      setLoadFailed(true);
    }
  }, [refresh]);

  useEffect(() => {
    if (me) {
      void load();
    }
  }, [me, load]);

  function report(text: string, isError: boolean) {
    if (isError) {
      notify.error(text);
    } else {
      notify.success(text);
    }
  }

  const addForm = useAppForm({
    defaultValues: { label: "" },
    onSubmit: async ({ value, formApi }) => {
      try {
        const result = await registerPasskey(value.label.trim());
        if (result.ok) {
          formApi.reset();
          report("Passkey added", false);
          await load();
        } else if (result.reason === "cancelled") {
          report("Adding the passkey was cancelled.", true);
        } else if (result.reason === "already-registered") {
          report("This device already has a passkey for your account.", true);
        } else {
          report("Could not add the passkey. Sign in again and retry.", true);
        }
      } catch {
        report("Could not add the passkey. Sign in again and retry.", true);
      }
    },
  });

  async function onRemove(passkey: Passkey) {
    const result = await removePasskey(passkey.credentialId);
    if (result.ok) {
      report("Passkey removed", false);
      await load();
    } else if (result.reason === "signed-out") {
      await refresh();
    } else if (result.reason === "last-credential") {
      report("That is your only way to sign in, so it stays.", true);
    } else {
      report("Could not remove the passkey.", true);
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
            <addForm.AppField name="label" validators={{ onBlur: labelError, onSubmit: labelError }}>
              {(field) => <field.InputField label="Passkey label" placeholder="Work laptop" />}
            </addForm.AppField>
            <addForm.SubmitButton>Add a passkey</addForm.SubmitButton>
          </Stack>
        </addForm.Form>
      </addForm.AppForm>
      {loadFailed && (
        <Text role="alert" color="fg.error">
          Could not load the passkeys.
        </Text>
      )}
      {passkeys.length === 0 ? (
        <Text color="fg.muted">No passkeys yet.</Text>
      ) : (
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
            {passkeys.map((passkey) => (
              <Table.Row key={passkey.credentialId}>
                <Table.Cell>{passkey.label}</Table.Cell>
                <Table.Cell>{formatDate(passkey.createdAt)}</Table.Cell>
                <Table.Cell>{formatDate(passkey.lastUsedAt)}</Table.Cell>
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
