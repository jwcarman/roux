/**
 * Where the API client sends paths without a leading slash, where it finds the CSRF token, and which
 * paths' 401s mean the session is lost.
 */
export interface ApiSettings {
  /** Where a path without a leading slash goes: `"customers"` becomes `/api/customers`. */
  baseUrl: string;
  /** What the client calls, before its first write, to get the CSRF cookie. */
  csrfBootstrapPath: string;
  /** The paths whose 401 means the session is lost. */
  sessionPathPrefix: string;
}

let current: ApiSettings = { baseUrl: "/api", csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" };

/**
 * Changes the settings named in `settings`, keeping the others. Moving the API (`baseUrl`) moves
 * where its 401s come from, so set `sessionPathPrefix` with it: `{ baseUrl: "/v2", sessionPathPrefix: "/v2/" }`.
 */
export function configureApi(settings: Partial<ApiSettings>): void {
  current = { ...current, ...settings };
}

/**
 * The settings in force: `baseUrl` `/api` and who's paths (`/who/me` and `/api/`) unless
 * {@link configureApi} changed them.
 */
export function apiSettings(): ApiSettings {
  return { ...current };
}
