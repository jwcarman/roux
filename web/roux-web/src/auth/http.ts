import { withoutTrailingSlashes } from "../api/url";
import {
  type BrowserSessionRequired,
  type LastCredential,
  type SignInRequired,
  AuthError,
  type AuthResult,
} from "./result";

/** How a client is made. */
export interface AuthClientOptions<D> {
  /**
   * Where who is: `who.base-path` on the page's origin (default `/api/roux/auth`), or an absolute URL. An
   * absolute one works only when the page can read who's `XSRF-TOKEN` cookie (the same site, with
   * the cookie's domain covering both).
   */
  baseUrl?: string;
  /** Turns a failed response's body into the application's own error type, the results' `detail`. */
  decodeError?: (response: Response) => Promise<D>;
  /** Replaces the global `fetch`, for tests or instrumentation. */
  fetch?: typeof fetch;
  /**
   * Sends the page to another site, for the calls that leave it (starting a provider link).
   * Defaults to `location.assign`.
   */
  navigate?: (url: string) => void;
}

/** One request a call makes, and how it reads the answer. */
export interface Call<T, R extends string> {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  /** Below the base URL, starting with `/`. */
  path: string;
  body?: unknown;
  accept?: string;
  /** Extra request headers for this one call. */
  headers?: Record<string, string>;
  /** Reads a success's value. */
  read: (response: Response) => Promise<T>;
  /** The call's reason for a failed status and `Roux-Error` code, or undefined if unexpected. */
  reason: (status: number, code: string | null) => R | undefined;
}

const CSRF_COOKIE = "XSRF-TOKEN";
const CSRF_HEADER = "X-XSRF-TOKEN";
const ERROR_HEADER = "Roux-Error";

/** Reads a JSON success body. */
export function json<T>(): (response: Response) => Promise<T> {
  return (response) => response.json() as Promise<T>;
}

/** Reads nothing from a success. */
export function nothing(): Promise<void> {
  return Promise.resolve();
}

/** A 401 on a call that needs a recent sign-in, told apart by who's `Roux-Error` code. */
export function signInRequired(status: number, code: string | null): SignInRequired | undefined {
  if (status !== 401) {
    return undefined;
  }
  if (code === "not-signed-in") {
    return "signed-out";
  }
  return code === "reauthentication-required" ? "reauthentication-required" : "sign-in-required";
}

/** A 401 on a call that needs only a sign-in. */
export function signedOut(status: number): "signed-out" | undefined {
  return status === 401 ? "signed-out" : undefined;
}

/** A 403 who names `browser-session-required`: the call needs a browser session on its own. */
export function browserSessionRequired(status: number, code: string | null): BrowserSessionRequired | undefined {
  return status === 403 && code === "browser-session-required" ? code : undefined;
}

/**
 * The reasons removing one of your sign-in credentials (a passkey, an email address, a linked
 * account) can fail: it needs a recent sign-in from a browser session on its own, the id is not one
 * of yours, or it is your last, which who names `last-credential` in `Roux-Error`. A 409 that does
 * not say so is unexpected.
 */
export function removeCredential(
  status: number,
  code: string | null,
): SignInRequired | BrowserSessionRequired | "not-found" | LastCredential | undefined {
  if (status === 404) {
    return "not-found";
  }
  if (status === 409) {
    return code === "last-credential" ? code : undefined;
  }
  return signInRequired(status, code) ?? browserSessionRequired(status, code);
}

/**
 * who's code for a failure: the `Roux-Error` header, or, where it cannot be read (a page on
 * another origin whose CORS configuration does not expose it), the `code` of who's Problem
 * Details body. Reads a copy, so `decodeError` still gets the body.
 */
async function errorCode(response: Response): Promise<string | null> {
  const header = response.headers.get(ERROR_HEADER);
  if (header !== null) {
    return header;
  }
  const body = await readJson(response.clone());
  if (typeof body === "object" && body !== null && "code" in body && typeof body.code === "string") {
    return body.code;
  }
  return null;
}

/** The default `decodeError`: a JSON body, or undefined. */
async function readJson(response: Response): Promise<unknown> {
  const text = await response.text();
  if (text === "") {
    return undefined;
  }
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

function normalize(baseUrl: string): string {
  if (baseUrl.includes("?") || baseUrl.includes("#")) {
    throw new Error(`roux-web auth: baseUrl must have no query or fragment, but is ${baseUrl}`);
  }
  return withoutTrailingSlashes(baseUrl);
}

function csrfToken(): string | undefined {
  const cookie = document.cookie.split("; ").find((c) => c.startsWith(`${CSRF_COOKIE}=`));
  return cookie === undefined ? undefined : decodeURIComponent(cookie.slice(CSRF_COOKIE.length + 1));
}

/** Sends who's requests: the URL, the cookies, CSRF, and reading the answer into a result. */
export class AuthHttp<D> {
  private readonly base: string;
  private readonly credentials: RequestCredentials;
  private readonly fetch: typeof fetch;
  private readonly decodeError: (response: Response) => Promise<D>;
  /** Sends the page elsewhere. */
  readonly navigate: (url: string) => void;

  constructor(options: AuthClientOptions<D>) {
    this.base = normalize(options.baseUrl ?? "/api/roux/auth");
    // an absolute base (scheme or //host) is another origin's, whose cookies must be asked for
    this.credentials = /^([a-z][a-z\d+.-]*:)?\/\//i.test(this.base) ? "include" : "same-origin";
    const given = options.fetch;
    // called as a plain function: a browser's fetch refuses to run with another `this`
    this.fetch = given ?? ((input, init) => fetch(input, init));
    this.decodeError = options.decodeError ?? (readJson as (response: Response) => Promise<D>);
    this.navigate = options.navigate ?? ((url) => location.assign(url));
  }

  /** A path below the base, as given (relative or absolute), for links the page renders. */
  href(path: string): string {
    return this.base + path;
  }

  /** The absolute URL of a path below the base. */
  url(path: string): string {
    return new URL(this.base + path, location.href).href;
  }

  /** Makes the call, answering its result; throws for anything the call does not expect. */
  async call<T, R extends string>(call: Call<T, R>): Promise<AuthResult<T, R, D>> {
    const response = await this.send(call.method, call.path, call.body, call.accept, call.headers);
    const where = `${call.method} ${call.path}`;
    if (response.ok) {
      try {
        return { ok: true, value: await call.read(response) };
      } catch (e) {
        throw new AuthError(
          `who answered ${where} with a body it could not read`,
          "unexpected",
          response.status,
          undefined,
          {
            cause: e,
          },
        );
      }
    }
    const reason = call.reason(response.status, await errorCode(response));
    if (reason === undefined) {
      throw new AuthError(`who answered ${where} with ${response.status}`, "unexpected", response.status);
    }
    return { ok: false, reason, status: response.status, detail: await this.decodeError(response) };
  }

  /** Asks who for a fresh CSRF cookie; `/me` sets one whether or not anyone is signed in. */
  async refreshCsrf(): Promise<void> {
    await this.fetch(this.url("/me"), { credentials: this.credentials });
  }

  private async send(
    method: string,
    path: string,
    body: unknown,
    accept: string | undefined,
    extra: Record<string, string> = {},
  ): Promise<Response> {
    const unsafe = method !== "GET";
    // the cookie exists only after a response from who
    if (unsafe && csrfToken() === undefined) {
      await this.refreshCsrf();
    }
    const headers: Record<string, string> = { ...extra };
    if (accept !== undefined) {
      headers.Accept = accept;
    }
    if (body !== undefined) {
      headers["Content-Type"] = "application/json";
    }
    // read at each request, never kept: it changes at sign-in and sign-out
    const token = unsafe ? csrfToken() : undefined;
    if (token !== undefined) {
      headers[CSRF_HEADER] = token;
    }
    return this.fetch(this.url(path), {
      method,
      credentials: this.credentials,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  }
}
