// The items app's contract, as roux's contract.gen.ts would be generated for it: what the surface tests bind to.

export interface AddItem {
  title: string;
  day: string;
}

export interface Added {
  id: string;
}

export interface ItemRow {
  id: string;
  day: string;
  at: string | null;
  title: string;
  assigneeNames: string[];
  status: string;
}

export interface ItemsArgs {
  when?: "all" | "overdue" | "today" | "week";
  status?: "open" | "done";
  assignee?: "anyone" | "me";
}

export interface Counts {
  open: number;
  overdue: number;
  today: number;
}

export type NoArgs = Record<string, never>;

export interface Queries {
  items: { kind: "query"; args: ItemsArgs; row: ItemRow; dependsOn: ["ItemAdded"] };
  itemsWithoutStatus: { kind: "query"; args: ItemsArgs; row: Omit<ItemRow, "status">; dependsOn: [] };
  counts: { kind: "lookup"; args: NoArgs; row: Counts; dependsOn: ["ItemAdded", "ItemDone"] };
}

export interface Commands {
  addItem: { input: AddItem; result: Added; emits: ["ItemAdded"] };
}

export const contract = {
  queries: {
    items: { kind: "query", dependsOn: ["ItemAdded"] },
    itemsWithoutStatus: { kind: "query", dependsOn: [] },
    counts: { kind: "lookup", dependsOn: ["ItemAdded", "ItemDone"] },
  },
  commands: {
    addItem: { emits: ["ItemAdded"] },
  },
} as const;
