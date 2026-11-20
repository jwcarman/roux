import type { QueryKey } from "@tanstack/react-query";
import { getJson } from "../api/client";
import { pageQuery, type PageDto, type PageQuery } from "../paging/paging";
import type { Activity } from "./Activity";

/**
 * A record's history as `ActivityList` takes it: `url` is the app's history endpoint
 * (`` path`students/${id}/activities` ``), `key` its query key. Put the key under the record's own
 * (`[...queryKeys.students.detail(id), "activities"]`) so what refreshes the record refreshes its history.
 */
export function historyQuery(key: QueryKey, url: string): PageQuery<Activity> {
  return pageQuery(key, ({ pageIndex = 0 }, signal) =>
    getJson<PageDto<Activity>>(url, { params: { pageIndex }, signal }),
  );
}
