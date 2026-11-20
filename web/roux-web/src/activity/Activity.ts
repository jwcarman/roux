/** One activity in a record's history, as the server's `ActivityLog.history` answers it. */
export interface Activity {
  id: string;
  /** When it happened: an instant (`2026-11-05T12:00:00Z`). */
  occurredAt: string;
  /** Its kind's code: `member.renamed`. */
  type: string;
  /** What happened, as written then: "Renamed from Ada to Ada King". */
  description: string;
  /** Who did it; `null` for the system. */
  actorId: string | null;
  /** Their name, "System", or "Unknown". */
  actorName: string;
  /** The facts the activity kept, as the server wrote them; a page that shows a kind its own way reads them. */
  details: Record<string, unknown>;
}
