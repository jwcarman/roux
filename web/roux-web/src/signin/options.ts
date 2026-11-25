import { useQuery } from "@tanstack/react-query";
import { unwrap, type SignInOptions } from "../auth";
import { auth } from "./auth";

/** What a signed-out page asks the server for: the ways of signing in that are on. */
const SIGN_IN_OPTIONS = ["roux", "signInOptions"] as const;

async function signInOptions(): Promise<SignInOptions> {
  return unwrap(await auth.signInOptions());
}

/** The ways of signing in the server reports as on: email, passkey, and each provider, in roux's order. */
export function useSignInOptions() {
  return useQuery({ queryKey: SIGN_IN_OPTIONS, queryFn: signInOptions });
}
