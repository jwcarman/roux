import { Heading, Stack } from "@chakra-ui/react";
import { createFileRoute } from "@tanstack/react-router";
import { EmailLinkLanding } from "@jwcarman/roux-web/signin";

function LinkLanding() {
  return (
    <Stack gap="4">
      <Heading as="h1" size="lg">
        Signing you in
      </Heading>
      <EmailLinkLanding />
    </Stack>
  );
}

export const Route = createFileRoute("/signin/link")({
  component: LinkLanding,
});
