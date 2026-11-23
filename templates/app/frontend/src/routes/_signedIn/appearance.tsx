import { Stack } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { PageHeader } from "@jwcarman/roux-web/navigation";
import { AppearanceSettings } from "@jwcarman/roux-web/theme";
import { THEME_MANAGE } from "../../permissions.gen";
import { requirePermission } from "@jwcarman/roux-web/session";

function Appearance() {
  return (
    <Stack gap="8" maxW="3xl">
      <PageHeader title="Appearance" />
      <AppearanceSettings />
    </Stack>
  );
}

export const Route = createFileRoute("/_signedIn/appearance")({
  beforeLoad: ({ context }) => requirePermission(context.me, THEME_MANAGE),
  component: Appearance,
});
