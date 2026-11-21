import { useQuery } from "@tanstack/react-query";
import { unwrap, type SignInOptions } from "@jwcarman/who-client";
import { who } from "./who";

/** What a signed-out page asks who for: the ways of signing in that are on. */
const SIGN_IN_OPTIONS = ["roux", "signInOptions"] as const;

async function signInOptions(): Promise<SignInOptions> {
  return unwrap(await who.signInOptions());
}

/** The ways of signing in who reports as on: email, passkey, and each provider, in who's order. */
export function useSignInOptions() {
  return useQuery({ queryKey: SIGN_IN_OPTIONS, queryFn: signInOptions });
}
