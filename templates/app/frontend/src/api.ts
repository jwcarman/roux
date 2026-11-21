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

/** The signed-in user's own profile; `version` goes back with a rename. */
export interface Profile {
  displayName: string;
  email: string;
  version: number;
}

/** A row of the team directory. */
export interface User {
  id: string;
  displayName: string;
  email: string;
  role: "OWNER" | "USER";
  status: "ACTIVE" | "DEACTIVATED";
}

/** A user as their detail page shows them. */
export interface UserDetail extends User {
  /** When their identity was created (ISO 8601). */
  joinedAt: string;
}

