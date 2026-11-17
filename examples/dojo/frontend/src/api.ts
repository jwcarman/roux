import type { ThemeSettings } from "./shell/theme";
import { who } from "./who";

export interface Me {
  identityId: string;
  permissions: string[];
}

/** The signed-in caller, or null when signed out. */
export async function fetchMe(): Promise<Me | null> {
  const result = await who.me.get();
  return result.ok ? result.value : null;
}

export const MEMBERS_INVITE = "members.invite";
export const MEMBERS_READ = "members.read";
export const MEMBERS_PROFILE = "members.profile";
export const MEMBERS_MANAGE = "members.manage";
export const THEME_MANAGE = "theme.manage";
export const RANKS_READ = "ranks.read";
export const RANKS_MANAGE = "ranks.manage";
export const STUDENTS_READ = "students.read";
export const STUDENTS_MANAGE = "students.manage";
export const PROMOTIONS_MANAGE = "promotions.manage";
export const CLASSES_READ = "classes.read";
export const CLASSES_MANAGE = "classes.manage";
export const ATTENDANCE_RECORD = "attendance.record";
export const ATTENDANCE_READ = "attendance.read";

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
  role: "OWNER" | "INSTRUCTOR" | "MEMBER";
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

