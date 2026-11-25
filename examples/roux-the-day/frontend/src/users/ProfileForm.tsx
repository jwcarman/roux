import { Stack, Text } from "@chakra-ui/react";
import { notify } from "@jwcarman/roux-web/feedback";
import { useSchemaForm } from "@jwcarman/roux-web/form";
import { type Profile, useSession } from "@jwcarman/roux-web/session";
import { renameMe, renameSchema } from "@jwcarman/roux-web/users";

/** The signed-in user's own profile: rename, with the email shown as text (it cannot change here). */
export function ProfileForm() {
  const { profile, refreshProfile } = useSession();
  if (!profile) {
    return null;
  }
  return <ProfileEditor profile={profile} refreshProfile={refreshProfile} />;
}

interface ProfileEditorProps {
  profile: Profile;
  refreshProfile: () => Promise<void>;
}

function ProfileEditor({ profile, refreshProfile }: Readonly<ProfileEditorProps>) {
  const form = useSchemaForm({
    schema: renameSchema,
    defaultValues: { displayName: profile.displayName },
    // At the version this form was read at: a change made elsewhere since answers 409, and the form
    // starts over from the reloaded profile. The profile is the session's, not a query, so it is
    // reloaded here after every answer, which is what brings that profile.
    mutation: {
      ...renameMe(profile.version),
      onSettled: () => refreshProfile(),
    },
    onSuccess: () => notify.success("Profile saved"),
    failure: "Could not save the profile",
  });

  return (
    <form.AppForm>
      <form.Form>
        <Stack gap="4">
          <form.AppField name="displayName">{(f) => <f.InputField label="Display name" />}</form.AppField>
          <Stack gap="1.5">
            <Text textStyle="sm" fontWeight="medium">
              Email
            </Text>
            <Text textStyle="sm">{profile.email}</Text>
          </Stack>
          <form.SubmitButton>Save profile</form.SubmitButton>
        </Stack>
      </form.Form>
    </form.AppForm>
  );
}
