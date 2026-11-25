import { browserSessionRequired, json, nothing, signedOut, signInRequired, type AuthHttp } from "./http";
import type { BrowserSessionRequired, InvalidRequest, SignInRequired, AuthResult } from "./result";

/** One of your API keys, as lists show it: never its secret. */
export interface ApiKey {
  id: string;
  name: string;
  /** Its scopes, sorted. */
  scopes: string[];
  createdAt: string;
  /** When it stops, or stopped, signing in. */
  expiresAt: string;
  /** When it last signed in, to within who's last-used interval; null if never. */
  lastUsedAt: string | null;
}

/** A key just made or rotated: the only answer that holds the raw `key`, so show it once. */
export interface NewApiKey {
  id: string;
  name: string;
  scopes: string[];
  expiresAt: string;
  /** The raw key, which who never shows again. */
  key: string;
}

/** What a new key is. */
export interface ApiKeyRequest {
  name: string;
  /** How long it signs in for, as an ISO-8601 duration such as `P30D`. */
  lifetime: string;
  scopes: string[];
}

/** A request an API key signed in may not manage keys, so a key never mints keys (`403`). */
export type ApiKeyCannotManageKeys = "api-key-cannot-manage-keys";

/**
 * Who may not manage keys: a request an API key signed in (`"api-key-cannot-manage-keys"`), and a
 * session cookie sent with an API key or a bearer token beside it (`"browser-session-required"`).
 */
export type ApiKeyCallerRefused = ApiKeyCannotManageKeys | BrowserSessionRequired;

/**
 * Your API keys (`client.me.apiKeys`). A browser session or a bearer token may manage them; a
 * request an API key signed in may not, so a key never mints keys.
 */
export interface ApiKeys<D> {
  /** Your keys, by name. */
  list(): Promise<AuthResult<ApiKey[], "signed-out" | ApiKeyCallerRefused, D>>;
  /** Makes a key, answering its secret once. A browser needs a recent sign-in. */
  create(
    request: ApiKeyRequest,
  ): Promise<AuthResult<NewApiKey, SignInRequired | ApiKeyCallerRefused | InvalidRequest, D>>;
  /**
   * Replaces one of your keys with a new one, answering its secret once; the old key keeps working
   * for `overlap` (an ISO-8601 duration such as `PT1H`). A browser needs a recent sign-in.
   */
  rotate(
    id: string,
    overlap: string,
  ): Promise<AuthResult<NewApiKey, SignInRequired | ApiKeyCallerRefused | "not-found" | InvalidRequest, D>>;
  /** Revokes one of your keys; another identity's is `"not-found"`. */
  revoke(id: string): Promise<AuthResult<void, "signed-out" | ApiKeyCallerRefused | "not-found", D>>;
  /** The key that signed this request in; `"not-found"` when no API key did. */
  current(): Promise<AuthResult<ApiKey, "signed-out" | "not-found", D>>;
}

function invalidRequest(status: number): InvalidRequest | undefined {
  return status === 400 ? "invalid-request" : undefined;
}

function signedOutOrNotFound(status: number): "signed-out" | "not-found" | undefined {
  return signedOut(status) ?? (status === 404 ? "not-found" : undefined);
}

function callerRefused(status: number, code: string | null): ApiKeyCallerRefused | undefined {
  return status === 403 && code === "api-key-cannot-manage-keys" ? code : browserSessionRequired(status, code);
}

export function apiKeys<D>(http: AuthHttp<D>): ApiKeys<D> {
  return {
    list: () =>
      http.call({
        method: "GET",
        path: "/me/api-keys",
        read: json<ApiKey[]>(),
        reason: (status, code) => signedOut(status) ?? callerRefused(status, code),
      }),
    create: (request) =>
      http.call({
        method: "POST",
        path: "/me/api-keys",
        body: { name: request.name, lifetime: request.lifetime, scopes: request.scopes },
        read: json<NewApiKey>(),
        reason: (status, code) => signInRequired(status, code) ?? callerRefused(status, code) ?? invalidRequest(status),
      }),
    rotate: (id, overlap) =>
      http.call({
        method: "POST",
        path: `/me/api-keys/${encodeURIComponent(id)}/rotations`,
        body: { overlap },
        read: json<NewApiKey>(),
        reason: (status, code): SignInRequired | ApiKeyCallerRefused | "not-found" | InvalidRequest | undefined =>
          signInRequired(status, code) ??
          callerRefused(status, code) ??
          (status === 404 ? "not-found" : invalidRequest(status)),
      }),
    revoke: (id) =>
      http.call({
        method: "DELETE",
        path: `/me/api-keys/${encodeURIComponent(id)}`,
        read: nothing,
        reason: (status, code) => signedOutOrNotFound(status) ?? callerRefused(status, code),
      }),
    current: () =>
      http.call({ method: "GET", path: "/me/api-keys/current", read: json<ApiKey>(), reason: signedOutOrNotFound }),
  };
}
