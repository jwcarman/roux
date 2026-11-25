/** A row of the items list (`/api/items`). */
export interface ItemRow {
  id: string;
  title: string;
  /** Its day, `YYYY-MM-DD`, in the team's zone. */
  day: string;
  /** Its time of day, `HH:mm`, or null for all day. */
  at: string | null;
  done: boolean;
  /** Who it is assigned to, by name. */
  assigneeNames: string[];
  version: number;
}

/** Someone an item is assigned to. */
export interface ItemPerson {
  id: string;
  name: string;
  /** False once they are deactivated: they must be replaced before the item can be saved. */
  active: boolean;
}

/** An item as its page shows it. */
export interface ItemDetail extends ItemRow {
  notes: string;
  assignees: ItemPerson[];
  createdBy: string;
  /** Whether the signed-in user may delete it: its author, or an owner. */
  canDelete: boolean;
}
