import { Button, Heading, Stack, Table, Text } from "@chakra-ui/react";
import { useCallback, useEffect, useState } from "react";
import { getJson, isSessionLost } from "@jwcarman/roux-web/api";
import { notify } from "@jwcarman/roux-web/feedback";
import { useAppForm } from "@jwcarman/roux-web/form";
import type { Passkey } from "../api";
import { registerPasskey, removePasskey } from "../members/passkeys";
import { useSession } from "./session";
import { ProfileForm } from "../members/ProfileForm";

function labelError({ value }: { value: string }) {
  return value.trim() ? undefined : "Name this passkey, such as the device it is on";
}

function formatDate(value: string | null): string {
  return value ? new Date(value).toLocaleString() : "Never";
}

export function Settings() {
  const { me } = useSession();
  const [passkeys, setPasskeys] = useState<Passkey[]>([]);
  const [loadFailed, setLoadFailed] = useState(false);

  const load = useCallback(async () => {
    try {
      setPasskeys(await getJson<Passkey[]>("/api/passkeys"));
    } catch (error) {
      // A lost session (for example, after removing the passkey this session signed in with) is
      // handled by the session provider, which sends the user to sign in.
      if (!isSessionLost(error)) {
        setLoadFailed(true);
      }
    }
  }, []);

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
        if (await registerPasskey(value.label.trim())) {
          formApi.reset();
          report("Passkey added", false);
          await load();
        } else {
          report("Could not add the passkey. Sign in again and retry.", true);
        }
      } catch {
        report("Adding the passkey was cancelled.", true);
      }
    },
  });

  async function onRemove(passkey: Passkey) {
    if (await removePasskey(passkey.credentialId)) {
      report("Passkey removed", false);
      await load();
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
              <Table.Row key={passkey.id}>
                <Table.Cell>{passkey.label}</Table.Cell>
                <Table.Cell>{formatDate(passkey.created)}</Table.Cell>
                <Table.Cell>{formatDate(passkey.lastUsed)}</Table.Cell>
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
