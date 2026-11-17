import { Heading, Stack, Text } from "@chakra-ui/react";
import { useEffect, useRef, useState } from "react";
import { Link as RouterLink, useNavigate } from "@tanstack/react-router";
import { send } from "@jwcarman/roux-web/api";
import { useSession } from "./session";

export function LinkLanding() {
  const { refresh } = useSession();
  const navigate = useNavigate();
  const [failed, setFailed] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    // A link works once; StrictMode runs effects twice in development.
    if (started.current) {
      return;
    }
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token");
    history.replaceState(null, "", window.location.pathname);
    if (!token) {
      setFailed(true);
      return;
    }
    void (async () => {
      const response = await send("POST", "/who/email/sign-in", { token });
      if (response.ok) {
        await refresh();
        await navigate({ to: "/", replace: true });
      } else {
        setFailed(true);
      }
    })();
  }, [navigate, refresh]);

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
