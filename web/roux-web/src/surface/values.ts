// The value types a surface's generated types (`<id>.surface.gen.ts`) name, as roux's server sends them.

/** A day, `yyyy-mm-dd`. */
export type IsoDate = string;

/** An amount of money, in the currency's minor units (cents), as roux's money package sends it. */
export type Money = { minorUnits: number; currency: string };

/** Where a page of a paged query sits in the whole, as roux's page package sends it. */
export type Pagination = {
  pageIndex: number;
  pageSize: number;
  totalElementCount: number;
  totalPageCount: number;
  hasNext: boolean;
  hasPrevious: boolean;
};
