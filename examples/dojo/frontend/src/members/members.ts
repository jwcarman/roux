import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { email, text } from "@jwcarman/roux-web/form";
import { pageQuery, type PageDto, type PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import type { Activity, Member, MemberDetail, Profile } from "../api";
import { queryKeys } from "../queryKeys";

/** The longest name, as the server's MemberProfile.MAX_NAME allows. */
const MAX_NAME = 80;

/** A role as people read it, for a member's page, the directory and the invite form; others show their name. */
export const ROLE_LABELS = { OWNER: "Owner", INSTRUCTOR: "Instructor", MEMBER: "Member" } as const;

/** InviteController.InvitationRequest's rules, in roux's words. */
export const invitationSchema = z.object({
  name: text().max(MAX_NAME),
  email: email(),
  role: text(),
});

/** An invitation as it is sent: a name and an email address, trimmed. */
export type Invitation = z.output<typeof invitationSchema>;

/** The server's answer to an invitation: the member is invited either way. */
export interface InvitationResult {
  linkSent: boolean;
}

/** MembersController.Rename's rules (without the version), in roux's words. */
export const renameSchema = z.object({
  displayName: text().max(MAX_NAME),
});

/** A rename as it is sent, before the version is added. */
export type Rename = z.output<typeof renameSchema>;

/** The directory's filters, as `/api/members` takes them. */
export type MemberFilters = { search?: string; role?: string; status?: string };

/** What a manager can do to a member's status: the endpoint under `/api/members/{id}/`. */
export type MemberStatusAction = "deactivate" | "reactivate";

/** `/api/members`: one function per endpoint. */
export const membersApi = {
  list: (params: PageParams & MemberFilters, signal?: AbortSignal) =>
    getJson<PageDto<Member>>("members", { params, signal }),
  get: (id: string, signal?: AbortSignal) => getJson<MemberDetail>(path`members/${id}`, { signal }),
  activities: (id: string, pageIndex: number, signal?: AbortSignal) =>
    getJson<PageDto<Activity>>(path`members/${id}/activities`, { params: { pageIndex }, signal }),
  invite: (invitation: Invitation) => sendJson<InvitationResult>("POST", "members/invitations", invitation),
  changeStatus: (id: string, action: MemberStatusAction) =>
    sendJson<MemberDetail>("POST", path`members/${id}/${action}`),
  rename: (rename: Rename & { version: number }) => sendJson<Profile>("PUT", "members/me", rename),
};

/** The roles an invitation may give, in the order the server lists them (`roux.roles.invitable`). */
export const invitableRolesQuery = queryOptions({
  queryKey: queryKeys.roles.invitable(),
  queryFn: ({ signal }) => getJson<string[]>("roles/invitable", { signal }),
});

/** A member, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function memberQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.members.detail(id),
    queryFn: ({ signal }) => membersApi.get(id, signal),
  });
}

/** The directory under `filters`, as a QueryTable takes it: its key and how to fetch a page. */
export function membersPage(filters: MemberFilters) {
  return pageQuery(queryKeys.members.list(filters), (params, signal) =>
    membersApi.list({ ...params, ...filters }, signal),
  );
}

/** A member's history, newest first, as an ActivityList takes it. */
export function activitiesPage(id: string) {
  return pageQuery(queryKeys.members.activities(id), ({ pageIndex = 0 }, signal) =>
    membersApi.activities(id, pageIndex, signal),
  );
}

/** Invites a member; the directory refreshes. */
export const inviteMember = mutationOptions({
  mutationFn: (invitation: Invitation) => membersApi.invite(invitation),
  meta: { refreshes: [queryKeys.members.lists()] },
});

/** Deactivates or reactivates the member `id`; their page, the directory and their history refresh. */
export const changeMemberStatus = (id: string) =>
  mutationOptions({
    mutationFn: ({ action }: { action: MemberStatusAction }) => membersApi.changeStatus(id, action),
    meta: {
      refreshes: [queryKeys.members.detail(id), queryKeys.members.lists(), queryKeys.members.activities(id)],
    },
  });

/** Renames the signed-in member at the profile `version` this form read; a change made since answers 409. */
export const renameMe = (version: number) =>
  mutationOptions({
    mutationFn: (rename: Rename) => membersApi.rename({ ...rename, version }),
  });
