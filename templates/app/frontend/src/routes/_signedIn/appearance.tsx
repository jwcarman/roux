import { Heading, Stack } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { AppearanceSettings } from "@jwcarman/roux-web/theme";
import { THEME_MANAGE } from "../../permissions.gen";
import { requirePermission } from "../../shell/guards";

function Appearance() {
  return (
    <Stack gap="8" maxW="3xl">
      <Heading as="h2" size="lg">
        Appearance
      </Heading>
      <AppearanceSettings />
    </Stack>
  );
}

export const Route = createFileRoute<"/_signedIn/appearance">()({
  beforeLoad: ({ context }) => requirePermission(context.me, THEME_MANAGE),
  component: Appearance,
});
