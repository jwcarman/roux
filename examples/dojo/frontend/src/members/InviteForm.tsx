import { Button } from "@chakra-ui/react";
import { LuUserPlus } from "react-icons/lu";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, useSchemaForm } from "@jwcarman/roux-web/form";
import { INVITABLE_ROLES, invitationSchema, inviteMember, ROLE_LABELS } from "./members";

/**
 * "Invite member": a button that opens the invite form in a dialog. The outcome is a toast; a
 * mistake stays in the open dialog. The directory refreshes before the dialog closes.
 */
export function InviteForm() {
  const form = useSchemaForm({
    schema: invitationSchema,
    defaultValues: { name: "", email: "", role: "MEMBER" },
    mutation: inviteMember,
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
      title="Invite a member"
      trigger={
        <Button alignSelf="start">
          <LuUserPlus aria-hidden />
          Invite member
        </Button>
      }
      submitLabel="Send invitation"
    >
      <form.AppField name="name">{(f) => <f.InputField label="Name" />}</form.AppField>
      <form.AppField name="email">{(f) => <f.InputField label="Email" type="email" />}</form.AppField>
      <form.AppField name="role">
        {(f) => <f.SelectField label="Role" options={INVITABLE_ROLES} labels={ROLE_LABELS} />}
      </form.AppField>
    </FormDialog>
  );
}
