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

