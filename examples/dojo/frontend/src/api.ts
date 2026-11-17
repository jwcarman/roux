import { get } from "@jwcarman/roux-web/api";

import type { ThemeSettings } from "./shell/theme";

export interface Me {
  identityId: string;
  permissions: string[];
}

/** The signed-in caller, or null when signed out. */
export async function fetchMe(): Promise<Me | null> {
  const response = await get("/who/me");
  return response.ok ? ((await response.json()) as Me) : null;
}

export interface Passkey {
  id: string;
  credentialId: string;
  label: string;
  created: string;
  lastUsed: string | null;
}

export const MEMBERS_INVITE = "members.invite";
export const MEMBERS_READ = "members.read";
export const MEMBERS_PROFILE = "members.profile";
export const MEMBERS_MANAGE = "members.manage";
export const THEME_MANAGE = "theme.manage";

/** The signed-in member's own profile; `version` goes back with a rename. */
export interface Profile {
  displayName: string;
  email: string;
  version: number;
}

/** A row of the team directory. */
export interface Member {
  id: string;
  displayName: string;
  email: string;
  role: "OWNER" | "MEMBER";
  status: "ACTIVE" | "DEACTIVATED";
}

/** A member as their detail page shows them. */
export interface MemberDetail extends Member {
  /** When their identity was created (ISO 8601). */
  joinedAt: string;
}

/** A line of history: what changed, who changed it and when. */
export interface Activity {
  id: string;
  occurredAt: string;
  action: string;
  summary: string;
  /** Their display name, "System", or "A former member". */
  actorName: string;
}

/** The app's theme as `/api/theme` answers it: the settings and the version to save them at. */
export type SavedTheme = ThemeSettings & { version: number };

