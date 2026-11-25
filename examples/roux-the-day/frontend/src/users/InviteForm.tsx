import { Button, type ButtonProps } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { LuUserPlus } from "react-icons/lu";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import {
  invitableRolesQuery,
  invitationSchema,
  inviteUser,
  ROLE_LABELS,
} from "./users";

/** The button; it passes on what a dialog trigger gives it. */
function InviteButton(props: ButtonProps) {
  return (
    <Button alignSelf="start" {...props}>
      <LuUserPlus aria-hidden />
      Invite user
    </Button>
  );
}

/**
 * "Invite user": a button that opens the invite form in a dialog. The roles it offers are the
 * server's (roles are data), so the button waits for them, and stays disabled when no role may be
 * invited. The outcome is a toast; a mistake stays in the open dialog. The directory refreshes
 * before the dialog closes.
 */
export function InviteForm() {
  const roles = useQuery(invitableRolesQuery).data;
  if (!roles?.length) {
    return <InviteButton disabled />;
  }
  return <InviteDialog roles={roles} />;
}

/** The form, once the roles are known: the first one is chosen. */
function InviteDialog({ roles }: Readonly<{ roles: string[] }>) {
  const form = useSchemaForm({
    schema: invitationSchema,
    defaultValues: { name: "", email: "", role: roles[0] },
    mutation: inviteUser,
    onSuccess: ({ linkSent }, { name, email }) => {
      if (linkSent) {
        notify.success("Invitation sent");
      } else {
        notify.error(
          `${name} was added, but the invitation email could not be sent.`,
          `Ask them to sign in from the sign-in page with ${email}.`,
        );
      }
    },
    failure: "Could not send the invitation",
  });

  return (
    <FormDialog
      form={form}
      title="Invite a user"
      trigger={<InviteButton />}
      submitLabel="Send invitation"
    >
      <form.AppField name="name">
        {(f) => <f.InputField label="Name" />}
      </form.AppField>
      <form.AppField name="email">
        {(f) => <f.InputField label="Email" type="email" />}
      </form.AppField>
      <form.AppField name="role">
        {(f) => (
          <f.SelectField label="Role" options={roles} labels={ROLE_LABELS} />
        )}
      </form.AppField>
    </FormDialog>
  );
}
