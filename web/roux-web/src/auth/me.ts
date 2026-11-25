import { type ApiKeys, apiKeys } from "./apiKeys";
import { type EmailAddresses, emailAddresses } from "./email";
import { json, signedOut, type AuthHttp } from "./http";
import { type Accounts, accounts } from "./oidc";
import { type MyPasskeys, myPasskeys } from "./passkeys";
import type { AuthResult } from "./result";
import { type Sessions, sessions } from "./sessions";

/** The signed-in identity. */
export interface Me {
  identityId: string;
  permissions: string[];
  /**
   * How this request signed in, as a lowercase hyphenated tag (`email-link`, `passkey`, `oidc`,
   * `api-key`...); for a browser, how its session signed in. Null when who does not know.
   */
  signInMethod: string | null;
  /**
   * When this browser session's sign-in stops being recent, which may have passed already: calls
   * needing a recent sign-in fail after it. Null for anything but a browser session.
   */
  recentSignInUntil: string | null;
  /** How many sign-in credentials you hold, by kind; empty when who cannot count them. */
  credentials: CredentialCounts;
}

/** Your own account, everything under who's `/me` (`client.me`). */
export interface MyAccount<D> {
  /** Who is signed in, and their permissions. */
  get(): Promise<AuthResult<Me, "signed-out", D>>;
  /** Where you are signed in. */
  sessions: Sessions<D>;
  /** Your passkeys. */
  passkeys: MyPasskeys<D>;
  /** Your email addresses. */
  emailAddresses: EmailAddresses<D>;
  /** Your linked provider accounts. */
  accounts: Accounts<D>;
  /** Your API keys. */
  apiKeys: ApiKeys<D>;
}

export function me<D>(http: AuthHttp<D>): MyAccount<D> {
  return {
    get: () => http.call({ method: "GET", path: "/me", read: json<Me>(), reason: signedOut }),
    sessions: sessions(http),
    passkeys: myPasskeys(http),
    emailAddresses: emailAddresses(http),
    accounts: accounts(http),
    apiKeys: apiKeys(http),
  };
}

/** How many sign-in credentials an identity holds, by kind. */
export interface CredentialCounts {
  email?: number;
  passkey?: number;
  account?: number;
}
