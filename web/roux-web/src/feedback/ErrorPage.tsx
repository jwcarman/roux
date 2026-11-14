import { Button, Heading, Stack, Text } from "@chakra-ui/react";

/** What a page that failed shows (a crash, or data that could not load), with a way to retry. */
export function ErrorPage({ onRetry }: { onRetry: () => void }) {
  return (
    <Stack gap="4" py="8" role="alert">
      <Heading as="h2">Something went wrong</Heading>
      <Text color="fg.muted">This page could not be shown. Trying again often works.</Text>
      <Button alignSelf="start" onClick={onRetry}>
        Try again
      </Button>
    </Stack>
  );
}
