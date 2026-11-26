// Generated from the Go queries and commands. Do not edit.

export interface AddItem {
  title?: string | null;
  day?: string | null;
}

export interface Added {
  id: string;
}

export interface ItemCounts {
  open: number;
  overdue: number;
  today: number;
}

export interface ItemRow {
  id: string;
  title: string;
  day: string;
  at: string | null;
  assigneeNames: string[];
  status: string;
  version: number;
}

export interface ItemsArgs {
  when?: "all" | "overdue" | "today" | "week";
  status?: "open" | "done";
  assignee?: "anyone" | "me";
}

export type NoArgs = Record<string, never>;

export interface Queries {
  itemCounts: { kind: "lookup"; args: NoArgs; row: ItemCounts; dependsOn: ["itemsChanged"] };
  items: { kind: "query"; args: ItemsArgs; row: ItemRow; dependsOn: ["itemsChanged"] };
}

export interface Commands {
  addItem: { input: AddItem; result: Added; emits: ["itemsChanged"] };
}

/** Each query's events and each command's, for the runtime (the types above are for the compiler). */
export const contract = {
  queries: {
    itemCounts: { kind: "lookup", dependsOn: ["itemsChanged"] },
    items: { kind: "query", dependsOn: ["itemsChanged"] },
  },
  commands: {
    addItem: { emits: ["itemsChanged"] },
  },
} as const;
