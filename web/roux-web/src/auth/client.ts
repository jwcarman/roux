import { type Email, email } from "./email";
import { json, nothing, type AuthClientOptions, AuthHttp } from "./http";
import { me, type MyAccount } from "./me";
import { type Oidc, oidc } from "./oidc";
import { type Passkeys, passkeys } from "./passkeys";
import type { AuthResult } from "./result";

/** A provider to draw a sign-in button for. */
export interface SignInProvider {
  /** The registration id, which `oidc.authorizeUrl` takes. */
  id: string;
  name: string;
}

/** The ways of signing in that are on, for a signed-out page to draw. */
export interface SignInOptions {
  email: boolean;
  passkey: boolean;
  providers: SignInProvider[];
}

/** who's browser endpoints, each a typed call. */
export interface AuthClient<D> {
  /** The ways of signing in that are on; public. */
  signInOptions(): Promise<AuthResult<SignInOptions, never, D>>;
  /** Signs out, and fetches a fresh CSRF cookie for whoever signs in next. */
  signOut(): Promise<void>;
  /** Your own account: who you are, your sessions, passkeys, addresses, linked accounts, API keys. */
  me: MyAccount<D>;
  /** Signing in by email link or code. */
  email: Email<D>;
  /** Signing in with a passkey. */
  passkeys: Passkeys<D>;
  /** Signing in with a provider, and finishing a pending sign-up or link. */
  oidc: Oidc<D>;
}

/**
 * Creates a client for who at `baseUrl` (default `/api/roux/auth`, who's default `who.base-path`).
 *
 * @throws Error if `baseUrl` has a query or fragment
 */
export function createAuthClient<D = unknown>(options: AuthClientOptions<D> = {}): AuthClient<D> {
  const http = new AuthHttp<D>(options);
  return {
    signInOptions: () =>
      http.call<SignInOptions, never>({
        method: "GET",
        path: "/sign-in",
        read: json<SignInOptions>(),
        reason: () => undefined,
      }),
    signOut: async () => {
      await http.call({ method: "POST", path: "/logout", read: nothing, reason: () => undefined });
      await http.refreshCsrf();
    },
    me: me(http),
    email: email(http),
    passkeys: passkeys(http),
    oidc: oidc(http),
  };
}
