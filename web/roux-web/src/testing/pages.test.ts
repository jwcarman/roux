import { describe, expect, it } from "vitest";
import { pageOf } from "./pages";

const rows = ["a", "b", "c", "d", "e"];

describe("pageOf", () => {
  it("answers the first page of 20 unless asked otherwise", () => {
    expect(pageOf(rows, {})).toEqual({
      data: rows,
      pagination: {
        pageIndex: 0,
        pageSize: 20,
        totalElementCount: 5,
        totalPageCount: 1,
        hasNext: false,
        hasPrevious: false,
      },
    });
  });

  it("answers a middle page with a page on each side", () => {
    expect(pageOf(rows, { pageIndex: 1, pageSize: 2 })).toEqual({
      data: ["c", "d"],
      pagination: {
        pageIndex: 1,
        pageSize: 2,
        totalElementCount: 5,
        totalPageCount: 3,
        hasNext: true,
        hasPrevious: true,
      },
    });
  });

  it("answers the last page with none after it", () => {
    expect(pageOf(rows, { pageIndex: 2, pageSize: 2 }).pagination).toMatchObject({ hasNext: false, hasPrevious: true });
  });
});
