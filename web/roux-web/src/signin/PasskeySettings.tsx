import { Box, Button, Flex, List, Stack, Text } from "@chakra-ui/react";
import { useMutation, useQuery } from "@tanstack/react-query";
import type { Passkey } from "@jwcarman/who-client";
import { useState } from "react";
import { formatInstantDate } from "../dates/format";
import { notify } from "../feedback/notify";
import { useAppForm } from "../form/form";
import { FormDialog } from "../form/FormDialog";
import { listPasskeys, PASSKEY_LABEL_MAX, passkeyLabelError, registerPasskey, removePasskey } from "./passkeys";

export interface PasskeySettingsProps {
  /**
   * Called when who says the session has ended (for example, the person removed the passkey they
   * signed in with): the app's session refreshes, and its guards send them to sign in.
   */
  onSignedOut: () => Promise<unknown>;
}

/** The signed-in person's passkeys, kept apart from the app's own queries. */
const PASSKEYS = ["who", "passkeys"] as const;

const NOT_ADDED = "Could not add the passkey. Sign in again and retry.";

/** Why a passkey was not added, by who's reason; any other reason gets the general message. */
const NOT_ADDED_BECAUSE: Partial<Record<string, string>> = {
  cancelled: "Adding the passkey was cancelled.",
  "already-registered": "This device already has a passkey for your account.",
};

function labelError({ value }: { value: string }) {
  return passkeyLabelError(value);
}

/** The day of a passkey's moment in the organization's zone, or "never". */
function dayOf(value: string | null): string {
  return value ? formatInstantDate(value) : "never";
}

/**
 * The signed-in person's passkeys: the list (each with when it was added and last used, and
 * Remove), "No passkeys yet.", and "Add a passkey" in a dialog. Place it in the app's Settings page,
 * under the page's own heading for it.
 */
export function PasskeySettings({ onSignedOut }: PasskeySettingsProps) {
  const [adding, setAdding] = useState(false);
  const passkeys = useQuery({
    queryKey: PASSKEYS,
    // null: they could not be loaded.
    queryFn: async (): Promise<Passkey[] | null> => {
      try {
        const result = await listPasskeys();
        if (result.ok) {
          return result.value;
        }
        if (result.reason === "signed-out") {
          await onSignedOut();
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
    meta: { refreshes: [PASSKEYS] },
  });
  const remove = useMutation({
    mutationFn: (credentialId: string) => removePasskey(credentialId),
    meta: { refreshes: [PASSKEYS] },
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
          notify.error(NOT_ADDED_BECAUSE[result.reason] ?? NOT_ADDED);
        }
      } catch {
        notify.error(NOT_ADDED);
      }
    },
  });

  async function onRemove(passkey: Passkey) {
    const result = await remove.mutateAsync(passkey.credentialId);
    if (result.ok) {
      notify.success("Passkey removed");
    } else if (result.reason === "signed-out") {
      await onSignedOut();
    } else {
      notify.error(
        result.reason === "last-credential"
          ? "That is your only way to sign in, so it stays."
          : "Could not remove the passkey.",
      );
    }
  }

  return (
    <Stack gap="5">
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
              <Flex align="center" justify="space-between" gap="3" width="full">
                <Box minW="0">
                  <Text textStyle="sm" fontWeight="medium" truncate>
                    {passkey.label}
                  </Text>
                  <Text textStyle="xs" color="fg.muted">
                    Added {dayOf(passkey.createdAt)} · Last used {dayOf(passkey.lastUsedAt)}
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
        <addForm.AppField name="label" validators={{ onBlur: labelError, onSubmit: labelError }}>
          {(field) => (
            <field.InputField label="Passkey label" placeholder="Work laptop" maxLength={PASSKEY_LABEL_MAX} />
          )}
        </addForm.AppField>
      </FormDialog>
    </Stack>
  );
}
