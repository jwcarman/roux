import { problemOf, type Problem } from "../problem/problem";
import { apiSettings } from "./config";

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

export async function get(path: string): Promise<Response> {
  const response = await fetch(path, {
    credentials: "same-origin",
    headers: { Accept: "application/json" },
  });
  return notice(path, response);
}

export async function send(method: "POST" | "PUT" | "DELETE", path: string, body?: unknown): Promise<Response> {
  const headers: Record<string, string> = { Accept: "application/json", ...(await csrfHeader()) };
  if (body !== undefined) {
    headers["Content-Type"] = "application/json";
  }
  const response = await fetch(path, {
    method,
    credentials: "same-origin",
    headers,
    body: JSON.stringify(body), // undefined, so no body, when there is none
  });
  return notice(path, response);
}

export async function getJson<T>(path: string): Promise<T> {
  const response = await get(path);
  if (!response.ok) {
    throw new ApiError(response.status, await problemOf(response));
  }
  return (await response.json()) as T;
}
