import { browserSessionRequired, json, nothing, signedOut, signInRequired, type AuthHttp } from "./http";
import type { BrowserSessionRequired, SignInRequired, AuthResult } from "./result";

/**
 * One browser this person is signed in on. The id is the server's own, never the session cookie, so the
 * list can be shown without exposing a session.
 */
export interface Session {
  id: string;
  device: string;
  userAgent: string | null;
  /** How the browser signed in, as a lowercase hyphenated tag: `email-link`, `passkey`, `oidc`... */
  signInMethod: string;
  signedInAt: string;
  lastSeenAt: string;
  current: boolean;
}

/**
 * Where you are signed in, and signing browsers out (`client.me.sessions`). Only a browser session
 * on its own may call them (`"browser-session-required"` otherwise).
 */
export interface Sessions<D> {
  /** Where this person is signed in, newest first. */
  list(): Promise<AuthResult<Session[], "signed-out" | BrowserSessionRequired, D>>;
  /** Signs one browser out. This browser's own session ends at once; another needs a recent sign-in. */
  end(id: string): Promise<AuthResult<void, SignInRequired | BrowserSessionRequired | "not-found", D>>;
  /** Signs out every browser but this one; needs a recent sign-in. */
  endOthers(): Promise<AuthResult<{ ended: number }, SignInRequired | BrowserSessionRequired, D>>;
}

function browserOnly(status: number, code: string | null): SignInRequired | BrowserSessionRequired | undefined {
  return signInRequired(status, code) ?? browserSessionRequired(status, code);
}

export function sessions<D>(http: AuthHttp<D>): Sessions<D> {
  return {
    list: () =>
      http.call({
        method: "GET",
        path: "/me/sessions",
        read: json<Session[]>(),
        reason: (status, code) => signedOut(status) ?? browserSessionRequired(status, code),
      }),
    end: (id) =>
      http.call({
        method: "DELETE",
        path: `/me/sessions/${encodeURIComponent(id)}`,
        read: nothing,
        reason: (status, code) => browserOnly(status, code) ?? (status === 404 ? "not-found" : undefined),
      }),
    endOthers: () =>
      http.call({
        method: "DELETE",
        path: "/me/sessions?others=true",
        read: json<{ ended: number }>(),
        reason: browserOnly,
      }),
  };
}
