// Generated from the Go queries and commands. Do not edit.

export interface Money {
  minorUnits: number;
  currency: string;
}

export type NoArgs = Record<string, never>;

export interface contractAdded {
  id: string;
}

export interface contractArgs {
  status?: "open" | "done";
  text?: string;
}

export interface contractInput {
  title: string;
  due?: string | null;
  optional?: part | null;
  owner?: string | null;
  ids: number[];
}

export interface contractRow {
  createdBy: string;
  id: string;
  title: string;
  count: number;
  ratio: number;
  done: boolean;
  price: Money;
  note: string | null;
  tags: string[];
  parts: part[];
}

export interface part {
  name: string;
}

export interface Queries {
  rows: { kind: "query"; args: contractArgs; row: contractRow; dependsOn: ["RowAdded", "RowGone"] };
  summary: { kind: "lookup"; args: NoArgs; row: contractAdded; dependsOn: ["RowAdded"] };
}

export interface Commands {
  addRow: { input: contractInput; result: contractAdded; emits: ["RowAdded"] };
  quiet: { input: contractInput; result: contractAdded; emits: [] };
}

/** Each query's events and each command's, for the runtime (the types above are for the compiler). */
export const contract = {
  queries: {
    rows: { kind: "query", dependsOn: ["RowAdded", "RowGone"] },
    summary: { kind: "lookup", dependsOn: ["RowAdded"] },
  },
  commands: {
    addRow: { emits: ["RowAdded"] },
    quiet: { emits: [] },
  },
} as const;
