import { apiSettings } from "./config";

/** Query parameters: `null` and `undefined` are left out, an array repeats its key. */
export type QueryParams = Record<
  string,
  string | number | boolean | null | undefined | readonly (string | number | boolean)[]
>;

/**
 * Tagged template that URL-encodes every value it inserts:
 * `` path`customers/${id}` ``.
 */
export function path(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return values.reduce<string>((out, value, i) => `${out}${encodeURIComponent(value)}${strings[i + 1]}`, strings[0]);
}

function queryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value === null || value === undefined) {
      continue;
    }
    for (const item of Array.isArray(value) ? value : [value]) {
      search.append(key, String(item));
    }
  }
  return search.toString();
}

/**
 * The URL a call goes to: a path without a leading slash goes under `baseUrl`, one with a leading
 * slash is used as it is; `params` become the query string.
 */
export function resolveUrl(target: string, params?: QueryParams): string {
  const base = apiSettings().baseUrl.replace(/\/+$/, "");
  const url = target.startsWith("/") ? target : `${base}/${target}`;
  const query = params === undefined ? "" : queryString(params);
  if (query === "") {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}
