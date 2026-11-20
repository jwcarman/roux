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

