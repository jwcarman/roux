// Generated from items.surface.json and the typed catalog. Do not edit.
import type { IsoDate, Pagination } from "@jwcarman/roux-web/surface";

/** What the items surface shows, by top-level path: each is bound to a query or kept locally. */
export interface ItemsSurfaceData {
  counts: {
    open: number;
    overdue: number;
    today: number;
  };
  draft: {
    title: string;
    day: string;
  };
  errors: {
    title: string;
    day: string;
  };
  itemsArgs: {
    search: string;
    assignee: string;
    when: string;
    status: string;
    pageIndex: number;
    sortBy: string;
    sortDirection: string;
  };
  items: {
    data: {
      day: IsoDate | null;
      at: string | null;
      title: string | null;
      id: string;
      assigneeNames: string[];
      status: string | null;
    }[];
    pagination: Pagination;
  };
}

/** What each of the items surface's events carries. */
export interface ItemsSurfaceEvents {
  addItem: {
    title: string;
    day: string;
  };
}
