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

/** Who signed in. */
export interface SignedIn {
  identityId: string;
}

/** The reason signing in by email can fail: the link or code was wrong, used or expired. */
export type EmailSignInFailure = "rejected";

/** The reasons confirming a new address can fail. */
export type ConfirmAddressFailure = SignInRequired | BrowserSessionRequired | "rejected" | "conflict";

/** Signing in by email link or code. Your own addresses are under `client.me.emailAddresses`. */
export interface Email<D> {
  /**
   * Emails a sign-in link and code. The server answers the same whether or not the address is
   * known, so the answer tells an attacker nothing; anything but that answer throws.
   */
  send(email: string): Promise<AuthResult<void, never, D>>;
  /** Signs in with a link's token, or with the address and the emailed code. */
  signIn(
    credentials: { token: string } | { email: string; code: string },
  ): Promise<AuthResult<SignedIn, EmailSignInFailure, D>>;
  /**
   * Signs in with the link's token in this page's URL (`#token=...`), first taking it out of the
   * address bar and history; answers null when the URL has none.
   */
  signInFromLocation(): Promise<AuthResult<SignedIn, EmailSignInFailure, D> | null>;
}

/** One of your email addresses. */
export interface EmailAddress {
  /** The server's id for it, which `remove` and `add`'s `replaces` take. */
  id: string;
  address: string;
  createdAt: string;
}

/** The address a confirmation added. */
export interface ConfirmedAddress {
  credentialId: string;
}

/** Your email addresses: listing, adding, confirming and removing them (`client.me.emailAddresses`). */
export interface EmailAddresses<D> {
  /** Your addresses, oldest first. */
  list(): Promise<AuthResult<EmailAddress[], "signed-out", D>>;
  /**
   * Emails a confirmation to a new address, or one replacing `replaces` (the id of one of your
   * addresses). Needs a recent sign-in from a browser session on its own.
   */
  add(
    address: string,
    replaces?: string,
  ): Promise<AuthResult<void, SignInRequired | BrowserSessionRequired | "not-found", D>>;
  /** Confirms a new address with the emailed link's token or code. */
  confirm(proof: { token: string } | { code: string }): Promise<AuthResult<ConfirmedAddress, ConfirmAddressFailure, D>>;
  /**
   * Confirms with the token in this page's URL (`#confirm-address=...`), first taking it out of the
   * address bar and history; answers null when the URL has none.
   */
  confirmFromLocation(): Promise<AuthResult<ConfirmedAddress, ConfirmAddressFailure, D> | null>;
  /**
   * Removes one of your addresses by its id. Needs a recent sign-in; another identity's address is
   * `"not-found"`, and your last sign-in credential is `"last-credential"`.
   */
  remove(
    id: string,
  ): Promise<AuthResult<void, SignInRequired | BrowserSessionRequired | "not-found" | LastCredential, D>>;
}

/**
 * The token under `key` in this page's fragment, after taking the fragment out of the address bar
 * and history, so the token is never left behind whatever happens next.
 */
function takeFromFragment(key: string): string | null {
  const token = new URLSearchParams(location.hash.slice(1)).get(key);
  if (token !== null) {
    history.replaceState(null, "", location.pathname + location.search);
  }
  return token;
}

export function email<D>(http: AuthHttp<D>): Email<D> {
  const signIn = (credentials: { token: string } | { email: string; code: string }) =>
    http.call({
      method: "POST",
      path: "/email/sign-in",
      body: credentials,
      read: json<SignedIn>(),
      reason: (status): EmailSignInFailure | undefined => (status === 401 ? "rejected" : undefined),
    });
  return {
    send: (address) =>
      http.call<void, never>({
        method: "POST",
        path: "/email/send",
        body: { email: address },
        read: nothing,
        reason: () => undefined,
      }),
    signIn,
    signInFromLocation: async () => {
      const token = takeFromFragment("token");
      return token === null ? null : signIn({ token });
    },
  };
}

export function emailAddresses<D>(http: AuthHttp<D>): EmailAddresses<D> {
  const confirm = (proof: { token: string } | { code: string }) =>
    http.call({
      method: "POST",
      path: "/me/email-addresses/confirmations",
      body: proof,
      read: json<ConfirmedAddress>(),
      reason: (status, code): ConfirmAddressFailure | undefined =>
        signInRequired(status, code) ?? browserSessionRequired(status, code) ?? confirmRefusal(status),
    });
  return {
    list: () =>
      http.call({ method: "GET", path: "/me/email-addresses", read: json<EmailAddress[]>(), reason: signedOut }),
    add: (address, replaces) =>
      http.call({
        method: "POST",
        path: "/me/email-addresses",
        body: { address, replaces }, // JSON leaves replaces out when it is undefined
        read: nothing,
        reason: (status, code) =>
          signInRequired(status, code) ??
          browserSessionRequired(status, code) ??
          (status === 404 ? "not-found" : undefined),
      }),
    confirm,
    confirmFromLocation: async () => {
      const token = takeFromFragment("confirm-address");
      return token === null ? null : confirm({ token });
    },
    remove: (id) =>
      http.call({
        method: "DELETE",
        path: `/me/email-addresses/${encodeURIComponent(id)}`,
        read: nothing,
        reason: removeCredential,
      }),
  };
}

/** A confirmation the server refuses: a wrong or used proof (400), or an address taken meanwhile (409). */
function confirmRefusal(status: number): "rejected" | "conflict" | undefined {
  if (status === 400) {
    return "rejected";
  }
  return status === 409 ? "conflict" : undefined;
}
