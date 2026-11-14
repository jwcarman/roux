import { Heading, Link, Stack, Text } from "@chakra-ui/react";

/** What a URL that leads nowhere shows: an unknown page, or a record that does not exist. */
export function NotFoundPage({ title = "Page not found" }: { title?: string }) {
  return (
    <Stack gap="4" py="8">
      <Heading as="h2">{title}</Heading>
      <Text color="fg.muted">The address may be mistyped, or what it pointed to is gone.</Text>
      <Link href="/" alignSelf="start">
        Go to the home page
      </Link>
    </Stack>
  );
}
