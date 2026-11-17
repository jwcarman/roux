import { Heading, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useRouter } from "@tanstack/react-router";
import { send } from "@jwcarman/roux-web/api";
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
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    // Take the token out of the address bar. Only when there is one: this effect can run again as
    // the page is left (React reconnects a page the router is replacing), and by then the address is
    // the next page's, which must keep its search.
    if (window.location.hash !== "") {
      history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (!token) {
      setFailed(true);
      return;
    }
    void (async () => {
      const response = await send("POST", "/who/email/sign-in", { token });
      if (response.ok) {
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
