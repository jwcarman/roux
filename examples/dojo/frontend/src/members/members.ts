import { mutationOptions, queryOptions } from "@tanstack/react-query";
import { getJson, path, sendJson } from "@jwcarman/roux-web/api";
import { email, text } from "@jwcarman/roux-web/form";
import type { PageDto, PageParams } from "@jwcarman/roux-web/paging";
import { z } from "zod";
import type { Activity, Member, MemberDetail, Profile } from "../api";
import { queryKeys } from "../queryKeys";

/** The longest name, as the server's MemberProfile.MAX_NAME allows. */
const MAX_NAME = 80;

/** InvitationsController.Invitation's rules, in roux's words. */
export const invitationSchema = z.object({
  name: text().max(MAX_NAME),
  email: email(),
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
  activities: (id: string, pageIndex: number) =>
    getJson<PageDto<Activity>>(path`members/${id}/activities`, { params: { pageIndex } }),
  invite: (invitation: Invitation) => sendJson<InvitationResult>("POST", "members/invitations", invitation),
  changeStatus: (id: string, action: MemberStatusAction) =>
    sendJson<MemberDetail>("POST", path`members/${id}/${action}`),
  rename: (rename: Rename & { version: number }) => sendJson<Profile>("PUT", "members/me", rename),
};

/** A member, for a detail page's loader (`ensureQueryData`) and the page (`useSuspenseQuery`). */
export function memberQuery(id: string) {
  return queryOptions({
    queryKey: queryKeys.members.detail(id),
    queryFn: ({ signal }) => membersApi.get(id, signal),
  });
}

/** The directory under `filters`, as a QueryTable takes it: its key and the page query. */
export function membersQuery(filters: MemberFilters) {
  return {
    queryKey: queryKeys.members.list(filters),
    query: (params: PageParams) => membersApi.list({ ...params, ...filters }),
  };
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
