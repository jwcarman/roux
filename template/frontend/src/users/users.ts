import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { email, text } from "@jwcarman/roux-web/form";
import { pageQuery, type PageDto, type PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import { historyQuery } from "@jwcarman/roux-web/activity";
import type { Profile } from "@jwcarman/roux-web/session";
import type { User, UserDetail } from "../api";
import { queryKeys } from "../queryKeys";

/** The longest name, as the server's AppUser.MAX_NAME allows. */
const MAX_NAME = 80;

/** A role as people read it, for a user's page, the directory and the invite form; others show their name. */
export const ROLE_LABELS = { OWNER: "Owner", USER: "User" } as const;

/** roux's InvitationRequest's rules, in roux's words. */
export const invitationSchema = z.object({
  name: text().max(MAX_NAME),
  email: email(),
  role: text(),
});

/** An invitation as it is sent: a name and an email address, trimmed. */
export type Invitation = z.output<typeof invitationSchema>;

/** The server's answer to an invitation: the user is invited either way. */
export interface InvitationResult {
  linkSent: boolean;
}

/** roux's NameChange's rules (without the version), in roux's words. */
export const renameSchema = z.object({
  displayName: text().max(MAX_NAME),
});

/** A rename as it is sent, before the version is added. */
export type Rename = z.output<typeof renameSchema>;

/** The directory's filters, as `/api/roux/users` takes them. */
export type UserFilters = { search?: string; role?: string; status?: string };

/** What a manager can do to a user's status: the endpoint under `/api/roux/users/{id}/`. */
export type UserStatusAction = "deactivate" | "reactivate";

/** `/api/roux/users`: one function per endpoint. */
export const usersApi = {
  list: (params: PageParams & UserFilters, signal?: AbortSignal) =>
    getJson<PageDto<User>>("roux/users", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<UserDetail>(path`roux/users/${id}`, { signal }),
  invite: (invitation: Invitation) => sendJson<InvitationResult>("POST", "roux/users/invitations", invitation),
  changeStatus: (id: string, action: UserStatusAction) =>
    sendJson<UserDetail>("POST", path`roux/users/${id}/${action}`),
  rename: (rename: Rename & { version: number }) => sendJson<Profile>("PUT", "roux/users/me", rename),
};

/** The roles an invitation may give, in the order the server lists them (`roux.roles.invitable`). */
export const invitableRolesQuery = queryOptions({
  queryKey: queryKeys.roles.invitable(),
  queryFn: ({ signal }) => getJson<string[]>("roux/roles/invitable", { signal }),
});

/** A user, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function userQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.users.detail(id),
    queryFn: ({ signal }) => usersApi.get(id, signal),
  });
}

/** The directory under `filters`, as a QueryTable takes it: its key and how to fetch a page. */
export function usersPage(filters: UserFilters) {
  return pageQuery(queryKeys.users.list(filters), (params, signal) =>
    usersApi.list({ ...params, ...filters }, signal),
  );
}

/** A user's history, newest first, as an ActivityList takes it. */
export function activitiesPage(id: string) {
  return historyQuery(queryKeys.users.activities(id), path`roux/users/${id}/activities`);
}

/** Invites a user; the directory refreshes. */
export const inviteUser = mutationOptions({
  mutationFn: (invitation: Invitation) => usersApi.invite(invitation),
  meta: { refreshes: [queryKeys.users.lists()] },
});

/** Deactivates or reactivates the user `id`; their page, the directory and their history refresh. */
export const changeUserStatus = (id: string) =>
  mutationOptions({
    mutationFn: ({ action }: { action: UserStatusAction }) => usersApi.changeStatus(id, action),
    meta: {
      refreshes: [queryKeys.users.detail(id), queryKeys.users.lists(), queryKeys.users.activities(id)],
    },
  });

/** Renames the signed-in user at the profile `version` this form read; a change made since answers 409. */
export const renameMe = (version: number) =>
  mutationOptions({
    mutationFn: (rename: Rename) => usersApi.rename({ ...rename, version }),
  });
