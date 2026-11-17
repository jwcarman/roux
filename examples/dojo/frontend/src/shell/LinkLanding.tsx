import { Heading, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useRouter } from "@tanstack/react-router";
import { who } from "../who";
import { takeReturn } from "./returnTo";
import { useSession } from "./session";

export function LinkLanding() {
  const { refresh } = useSession();
  const router = useRouter();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // A link works once; StrictMode runs effects twice in development.
    if (started.current) {
      return;
    }
    started.current = true;
    void (async () => {
      // Takes the token out of the address bar and history, and signs in with it.
      const result = await who.email.signInFromLocation();
      if (result?.ok) {
        await refresh();
        // Back to the page the visitor asked for before signing in, else Home.
        const returnTo = takeReturn();
        if (returnTo === undefined) {
          await router.navigate({ to: "/", replace: true });
        } else {
          router.history.replace(returnTo);
        }
      } else {
        setFailed(true);
      }
    })();
  }, [router, refresh]);

  return (
    <Stack gap="4">
      <Heading as="h2">Signing you in</Heading>
      {failed ? (
        <Text role="alert">
          This link is invalid or has expired. <RouterLink to="/signin">Request a new one</RouterLink>.
        </Text>
      ) : (
        <Text>One moment...</Text>
      )}
    </Stack>
  );
}
