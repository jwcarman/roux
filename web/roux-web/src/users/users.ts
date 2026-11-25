import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, sendJson } from "../api/client";
import { path } from "../api/url";
import { activityQuery } from "../activity/activityQuery";
import { email, text } from "../form/rules";
import { pageQuery, type PageDto, type PageParams } from "../paging/paging";
import type { Profile } from "../session/session";
import { z } from "zod";

/** The longest display name, as the server's users.MaxNameLength allows. */
export const MAX_NAME = 80;

/** A row of the team directory (`GET /api/roux/users`). */
export interface User {
  id: string;
  displayName: string;
  /** Their oldest sign-in address; null when they have none. */
  email: string | null;
  /** Their role's name (the app's own, or OWNER); null when they hold none. */
  role: string | null;
  status: "ACTIVE" | "DEACTIVATED";
}

/** A user as their page shows them (`GET /api/roux/users/{id}`). */
export interface UserDetail extends User {
  /** When their identity was created (ISO 8601). */
  joinedAt: string;
  /** Never signed in, so the invitation can be sent again. */
  invited: boolean;
  version: number;
}

/** The server's rules for an invitation, in its words. */
export const invitationSchema = z.object({
  name: text().max(MAX_NAME),
  email: email(),
  role: text(),
});

/** An invitation as it is sent: a name, an email address and a role, trimmed. */
export type Invitation = z.output<typeof invitationSchema>;

/** The server's answer to an invitation: the person is invited either way. */
export interface InvitationResult {
  linkSent: boolean;
}

/** The server's rules for a rename (without the version), in its words. */
export const renameSchema = z.object({
  displayName: text().max(MAX_NAME),
});

/** A rename as it is sent, before the version is added. */
export type Rename = z.output<typeof renameSchema>;

/** The directory's filters, as `GET /api/roux/users` takes them. */
export type UserFilters = { search?: string; role?: string; status?: string };

/** What a manager can do to someone's status: the endpoint under `/api/roux/users/{id}/`. */
export type UserStatusAction = "deactivate" | "reactivate";

/**
 * The users queries' keys, under `["roux", ...]` so they never meet the app's own: a mutation's
 * `meta.refreshes: [userKeys.lists()]` refreshes every directory page. A user's history sits under
 * their detail, so what refreshes them refreshes it.
 */
export const userKeys = {
  all: ["roux", "users"] as const,
  lists: () => [...userKeys.all, "list"] as const,
  list: (filters: UserFilters) => [...userKeys.lists(), filters] as const,
  detail: (id: string) => [...userKeys.all, "detail", id] as const,
  activities: (id: string) => [...userKeys.detail(id), "activities"] as const,
  invitableRoles: () => ["roux", "roles", "invitable"] as const,
};

/** `/api/roux/users`: one function per endpoint. */
export const usersApi = {
  list: (params: PageParams & UserFilters, signal?: AbortSignal) =>
    getJson<PageDto<User>>("roux/users", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<UserDetail>(path`roux/users/${id}`, { signal }),
  invite: (invitation: Invitation) => sendJson<InvitationResult>("POST", "roux/users/invitations", invitation),
  changeStatus: (id: string, action: UserStatusAction) =>
    sendJson<UserDetail>("POST", path`roux/users/${id}/${action}`),
  renameMe: (rename: Rename & { version: number }) => sendJson<Profile>("PUT", "roux/users/me", rename),
};

/** The roles an invitation may give, in the order the server lists them. */
export const invitableRolesQuery = queryOptions({
  queryKey: userKeys.invitableRoles(),
  queryFn: ({ signal }) => getJson<string[]>("roux/roles/invitable", { signal }),
});

/** A user, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function userQuery(id: string) {
  return queryOptions({
    queryKey: userKeys.detail(id),
    queryFn: ({ signal }) => usersApi.get(id, signal),
  });
}

/** The directory under `filters`, as a QueryTable takes it. */
export function usersPage(filters: UserFilters) {
  return pageQuery(userKeys.list(filters), (params, signal) => usersApi.list({ ...params, ...filters }, signal));
}

/** A user's history, newest first, as an ActivityList takes it. */
export function userActivitiesPage(id: string) {
  return activityQuery(userKeys.activities(id), path`roux/users/${id}/activities`);
}

/** Invites someone; the directory refreshes. */
export const inviteUser = mutationOptions({
  mutationFn: (invitation: Invitation) => usersApi.invite(invitation),
  meta: { refreshes: [userKeys.lists()] },
});

/** Deactivates or reactivates the user `id`; their page, the directory and their history refresh. */
export const changeUserStatus = (id: string) =>
  mutationOptions({
    mutationFn: ({ action }: { action: UserStatusAction }) => usersApi.changeStatus(id, action),
    meta: { refreshes: [userKeys.detail(id), userKeys.lists(), userKeys.activities(id)] },
  });

/** Renames the signed-in user from the profile `version` the form read; a change made since answers 409. */
export const renameMe = (version: number) =>
  mutationOptions({
    mutationFn: (rename: Rename) => usersApi.renameMe({ ...rename, version }),
  });
