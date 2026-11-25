import type { QueryKey } from "@tanstack/react-query";
import { getJson } from "../api/client";
import { pageQuery, type PageDto, type PageQuery } from "../paging/paging";
import type { Activity } from "./Activity";

/**
 * A page query of activity as `ActivityList` takes it: `url` is the app's endpoint answering a page
 * of it, a record's history (`` path`students/${id}/activities` ``, Go's `activity.History`) or a
 * feed (`"activity"`, Go's `activity.Feed`); `key` its query key. Put a history's key under the
 * record's own (`[...queryKeys.students.detail(id), "activities"]`) so what refreshes the record
 * refreshes its history.
 */
export function activityQuery(key: QueryKey, url: string): PageQuery<Activity> {
  return pageQuery(key, ({ pageIndex = 0 }, signal) =>
    getJson<PageDto<Activity>>(url, { params: { pageIndex }, signal }),
  );
}
