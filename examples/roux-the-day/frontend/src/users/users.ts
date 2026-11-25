/** A role as people read it, for a user's page, the directory and the invite form. */
export const ROLE_LABELS: Readonly<Record<string, string>> = {
  OWNER: "Owner",
  USER: "User",
};

/** How a role reads: its label, else its name; nothing when there is none. */
export function roleLabel(role: string | null): string {
  return role === null ? "" : (ROLE_LABELS[role] ?? role);
}
