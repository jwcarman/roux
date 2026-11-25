import type { SignedIn } from "./email";
import {
  browserSessionRequired,
  json,
  nothing,
  removeCredential,
  signedOut,
  signInRequired,
  type AuthHttp,
} from "./http";
import type { BrowserSessionRequired, LastCredential, SignInRequired, AuthResult } from "./result";

/**
 * The provider account who holds in the session after a provider sign-in it could not finish
 * alone (`?pending=sign-up` or `?pending=link` on the page who sent the browser back to).
 */
export interface PendingSignUp {
  /** The provider's registration id. */
  provider: string;
  displayName: string;
  /** True when no one is signed in: the account can become a new identity. */
  canSignUp: boolean;
  /** True when someone is signed in: the account can be linked to them. */
  canLink: boolean;
}

/**
 * Signing in with a provider (Google, GitHub...), and finishing a sign-up or link who holds pending.
 * Your linked accounts are under `client.me.accounts`.
 */
export interface Oidc<D> {
  /**
   * Where a provider's sign-in button points: a plain link, a full page load, no CSRF. who
   * sends the browser back to the application when done.
   */
  authorizeUrl(registrationId: string): string;
  /** The pending provider account, for a page asking the person to confirm. */
  pending(): Promise<AuthResult<PendingSignUp, "none-pending", D>>;
  /** Makes the pending account a new identity, if the application's sign-up policy allows. */
  signUp(): Promise<AuthResult<SignedIn, "refused" | "none-pending", D>>;
  /**
   * Links the pending account to the signed-in identity. Call it only after the person confirms:
   * the confirmation is what stops someone planting their own account on yours.
   */
  link(): Promise<AuthResult<void, SignInRequired | "conflict" | "none-pending", D>>;
}

/** A provider account linked to you. */
export interface LinkedAccount {
  /** who's id for it, which `unlink` takes. */
  id: string;
  /** The provider's registration id, or its issuer when no registration matches any more. */
  provider: string;
  linkedAt: string;
}

/** Your linked provider accounts: listing, linking and unlinking them (`client.me.accounts`). */
export interface Accounts<D> {
  /** Your linked accounts, oldest first. */
  list(): Promise<AuthResult<LinkedAccount[], "signed-out", D>>;
  /**
   * Starts linking a provider account: sends the page to the provider, so on success the promise
   * never settles. who sends the browser back with `?pending=link`, and `client.oidc.link()`
   * finishes it. Needs a recent sign-in from a browser session on its own.
   */
  link(registrationId: string): Promise<AuthResult<never, SignInRequired | BrowserSessionRequired | "not-found", D>>;
  /**
   * Unlinks one of your accounts by its id. Needs a recent sign-in; another identity's account is
   * `"not-found"`, and your last sign-in credential is `"last-credential"`.
   */
  unlink(
    id: string,
  ): Promise<AuthResult<void, SignInRequired | BrowserSessionRequired | "not-found" | LastCredential, D>>;
}

export function oidc<D>(http: AuthHttp<D>): Oidc<D> {
  const noneOn404 = (status: number) => (status === 404 ? "none-pending" : undefined);
  return {
    authorizeUrl: (registrationId) => http.href(`/oidc/authorize/${encodeURIComponent(registrationId)}`),

    pending: () => http.call({ method: "GET", path: "/oidc/pending", read: json<PendingSignUp>(), reason: noneOn404 }),

    signUp: () =>
      http.call({
        method: "POST",
        path: "/oidc/pending/sign-up",
        read: json<SignedIn>(),
        reason: (status): "refused" | "none-pending" | undefined => (status === 403 ? "refused" : noneOn404(status)),
      }),

    link: () =>
      http.call({
        method: "POST",
        path: "/oidc/pending/link",
        read: nothing,
        reason: (status, code): SignInRequired | "conflict" | "none-pending" | undefined =>
          signInRequired(status, code) ?? (status === 409 ? "conflict" : noneOn404(status)),
      }),
  };
}

export function accounts<D>(http: AuthHttp<D>): Accounts<D> {
  return {
    list: () => http.call({ method: "GET", path: "/me/accounts", read: json<LinkedAccount[]>(), reason: signedOut }),

    link: async (registrationId) => {
      // asked for JSON, who answers where the provider is instead of redirecting: fetch cannot
      // follow a redirect to another site, so the page goes there itself
      const started = await http.call({
        method: "POST",
        path: `/me/accounts/${encodeURIComponent(registrationId)}`,
        accept: "application/json",
        read: json<{ redirectUrl: string }>(),
        reason: (status, code): SignInRequired | BrowserSessionRequired | "not-found" | undefined =>
          signInRequired(status, code) ??
          browserSessionRequired(status, code) ??
          (status === 404 ? "not-found" : undefined),
      });
      if (!started.ok) {
        return started;
      }
      http.navigate(started.value.redirectUrl);
      return new Promise<never>(() => {
        // the page is leaving
      });
    },

    unlink: (id) =>
      http.call({
        method: "DELETE",
        path: `/me/accounts/${encodeURIComponent(id)}`,
        read: nothing,
        reason: removeCredential,
      }),
  };
}
