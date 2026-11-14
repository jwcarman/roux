/** Where the API client finds the CSRF token and which paths' 401s mean the session is lost. */
export interface ApiSettings {
  /** Where a path without a leading slash goes: `"customers"` becomes `/api/customers`. */
  baseUrl: string;
  /** What the client calls, before its first write, to get the CSRF cookie. */
  csrfBootstrapPath: string;
  /** The paths whose 401 means the session is lost. */
  sessionPathPrefix: string;
}

let current: ApiSettings = { baseUrl: "/api", csrfBootstrapPath: "/who/me", sessionPathPrefix: "/api/" };

/** Changes the settings named in `settings`, keeping the others. */
export function configureApi(settings: Partial<ApiSettings>): void {
  current = { ...current, ...settings };
}

/** The settings in force: who's paths (`/who/me` and `/api/`) unless {@link configureApi} changed them. */
export function apiSettings(): ApiSettings {
  return { ...current };
}
