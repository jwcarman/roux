import { apiSettings } from "./config";

/** A query parameter's value: `null` and `undefined` are left out, an array repeats its key. */
type QueryParamValue = string | number | boolean | null | undefined | readonly (string | number | boolean)[];

/**
 * Query parameters: an object whose values are strings, numbers, booleans or arrays of them
 * (`null` and `undefined` are left out, an array repeats its key). Any object type will do, an
 * interface such as `PageParams` too, so it can be passed as it is.
 */
export type QueryParams = object;

/**
 * Tagged template that URL-encodes every value it inserts:
 * `` path`customers/${id}` ``.
 */
export function path(strings: TemplateStringsArray, ...values: (string | number)[]): string {
  return values.reduce<string>((out, value, i) => `${out}${encodeURIComponent(value)}${strings[i + 1]}`, strings[0]);
}

function queryString(params: QueryParams): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params) as [string, QueryParamValue][]) {
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
  const base = withoutTrailingSlashes(apiSettings().baseUrl);
  const url = target.startsWith("/") ? target : `${base}/${target}`;
  const query = params === undefined ? "" : queryString(params);
  if (query === "") {
    return url;
  }
  return `${url}${url.includes("?") ? "&" : "?"}${query}`;
}

/** `path` without the slashes it ends with: "/api//" is "/api". */
export function withoutTrailingSlashes(path: string): string {
  let trimmed = path;
  while (trimmed.endsWith("/")) {
    trimmed = trimmed.slice(0, -1);
  }
  return trimmed;
}
