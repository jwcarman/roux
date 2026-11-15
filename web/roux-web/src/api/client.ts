import { problemOf, type Problem } from "../problem/problem";
import { apiSettings } from "./config";
import { resolveUrl, type QueryParams } from "./url";

export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly problem: Problem = { type: "about:blank", title: "", status },
  ) {
    super(problem.detail ?? `Request failed with status ${status}`);
  }
}

/** True when the error is an API call that failed because the session is gone. */
export function isSessionLost(error: unknown): boolean {
  return error instanceof ApiError && error.status === 401;
}

const sessionLostListeners = new Set<() => void>();

/**
 * Calls the listener whenever an `/api/**` call (under the configured `sessionPathPrefix`) answers 401: the session expired, was signed out
 * elsewhere, or lost the credential it signed in with. The session provider listens and refreshes,
 * which sends the user to sign in; pages need not handle it. Returns the unsubscribe function.
 */
export function onSessionLost(listener: () => void): () => void {
  sessionLostListeners.add(listener);
  return () => sessionLostListeners.delete(listener);
}

/** `/who/me` answering 401 is how a signed-out page learns it is signed out, so only the API counts. */
function notice(path: string, response: Response): Response {
  if (response.status === 401 && path.startsWith(apiSettings().sessionPathPrefix)) {
    sessionLostListeners.forEach((listener) => listener());
  }
  return response;
}

function xsrfToken(): string | undefined {
  const cookie = document.cookie.split("; ").find((c) => c.startsWith("XSRF-TOKEN="));
  return cookie === undefined ? undefined : decodeURIComponent(cookie.slice("XSRF-TOKEN=".length));
}

/** The CSRF cookie is read afresh on every call: sign-in and sign-out rotate or clear it. */
async function csrfHeader(): Promise<Record<string, string>> {
  if (xsrfToken() === undefined) {
    await fetch(apiSettings().csrfBootstrapPath, { credentials: "same-origin" });
  }
  const token = xsrfToken();
  return token === undefined ? {} : { "X-XSRF-TOKEN": token };
}

/** Options for a read: query `params` and an abort `signal`. */
export interface RequestOptions {
  params?: QueryParams;
  signal?: AbortSignal;
}

/** GETs `path` (under `baseUrl` unless it starts with a slash). */
export async function get(path: string, options: RequestOptions = {}): Promise<Response> {
  const url = resolveUrl(path, options.params);
  const response = await fetch(url, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
    signal: options.signal,
  });
  return notice(url, response);
}

/** Sends a write, with the CSRF header and a JSON body when there is one. */
export async function send(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<Response> {
  const url = resolveUrl(path);
  const headers: Record<string, string> = { Accept: "application/json", ...(await csrfHeader()) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(url, {
    method,
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body), // undefined, so no body, when there is none
  });
  return notice(url, response);
}

/** GETs JSON; rejects with an {@link ApiError} on a non-2xx answer. */
export async function getJson<T>(path: string, options?: RequestOptions): Promise<T> {
  const response = await get(path, options);
  if (!response.ok) {
    throw new ApiError(response.status, await problemOf(response));
  }
  return (await response.json()) as T;
}

/**
 * Sends a write and parses the JSON answer; an answer without a body (a 204, a 201 with only a
 * `Location`, a bare 200) resolves `undefined`. Rejects with an {@link ApiError} on a non-2xx answer.
 */
export async function sendJson<T>(
  method: "POST" | "PUT" | "PATCH" | "DELETE",
  path: string,
  body?: unknown,
): Promise<T> {
  const response = await send(method, path, body);
  if (!response.ok) {
    throw new ApiError(response.status, await problemOf(response));
  }
  const text = await response.text();
  return (text === "" ? undefined : JSON.parse(text)) as T;
}
