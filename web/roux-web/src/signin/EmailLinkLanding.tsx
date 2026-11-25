import { Link, Text } from "@chakra-ui/react";
import { useQuery } from "@tanstack/react-query";
import { useEffect } from "react";
import { useSignInReturn } from "./returnTo";
import { auth } from "./auth";

/**
 * The page an emailed sign-in link opens (`PUBLIC_URL/signin/link`):
 * it takes the token out of the address bar and history, signs in with it once, and goes where the
 * visitor was going. A link that is used or too old is told, and so is a sign-in who could not
 * answer, each with a way back to `signInPath`.
 */
export function EmailLinkLanding({ signInPath = "/signin" }: Readonly<{ signInPath?: string }>) {
  const finish = useSignInReturn();
  // A link works once: asking through a query shares the one answer between StrictMode's two mounts.
  const redemption = useQuery({
    queryKey: ["roux", "emailLink"],
    queryFn: async () => {
      const result = await auth.email.signInFromLocation();
      return result?.ok === true;
    },
    retry: false,
    staleTime: Infinity,
  });

  useEffect(() => {
    if (redemption.data === true) {
      finish();
    }
  }, [redemption.data, finish]);

  if (redemption.isError) {
    return (
      <Text role="alert">
        Could not sign you in. Try the link again, or <Link href={signInPath}>request a new one</Link>.
      </Text>
    );
  }
  if (redemption.data === false) {
    return (
      <Text role="alert">
        This link is invalid or has expired. <Link href={signInPath}>Request a new one</Link>.
      </Text>
    );
  }
  return <Text>One moment...</Text>;
}
