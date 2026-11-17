import { Field, Heading, Input, Stack } from "@chakra-ui/react";
import { notify } from "@jwcarman/roux-web/feedback";
import { useSchemaForm } from "@jwcarman/roux-web/form";
import type { Profile } from "../api";
import { renameMe, renameSchema } from "./members";
import { useSession } from "../shell/session";

/** The signed-in member's own profile: rename, with the email shown read-only. */
export function ProfileForm() {
  const { profile, refreshProfile } = useSession();
  if (!profile) {
    return null;
  }
  return (
    <Stack gap="4">
      <Heading as="h3" size="md">
        Profile
      </Heading>
      <ProfileEditor profile={profile} refreshProfile={refreshProfile} />
    </Stack>
  );
}

interface ProfileEditorProps {
  profile: Profile;
  refreshProfile: () => Promise<void>;
}

function ProfileEditor({ profile, refreshProfile }: ProfileEditorProps) {
  const form = useSchemaForm({
    schema: renameSchema,
    defaultValues: { displayName: profile.displayName },
    // At the version this form was read at: a change made elsewhere since answers 409, and the form
    // starts over from the reloaded profile. The profile is the session's, not a query, so it is
    // reloaded here after every answer, which is what brings that profile.
    mutation: { ...renameMe(profile.version), onSettled: () => refreshProfile() },
    onSuccess: () => notify.success("Profile saved"),
    failure: "Could not save the profile",
  });

  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="4">
          <form.AppField name="displayName">{(f) => <f.InputField label="Display name" />}</form.AppField>
          <Field.Root readOnly>
            <Field.Label>Email</Field.Label>
            <Input readOnly value={profile.email} />
          </Field.Root>
          <form.SubmitButton>Save profile</form.SubmitButton>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}
