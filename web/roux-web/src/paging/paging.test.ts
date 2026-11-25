import { describe, expect, it, vi } from "vitest";
import {
  enumSearchOf,
  dateSearchOf,
  idSearchOf,
  tableSearchOf,
  fetchAllPages,
  nextPageIndex,
  pageParamsOf,
  pageQuery,
  queryStringOf,
  rowRange,
  searchTermOf,
  type PageDto,
  type PageParams,
} from "./paging";

function pageOf<T>(data: T[], pageIndex: number, pageSize: number, totalElementCount: number): PageDto<T> {
  const totalPageCount = Math.ceil(totalElementCount / pageSize);
  return {
    data,
    pagination: {
      pageIndex,
      pageSize,
      totalElementCount,
      totalPageCount,
      hasNext: pageIndex < totalPageCount - 1,
      hasPrevious: pageIndex > 0,
    },
  };
}

describe("pageQuery", () => {
  it("pairs a list's key with how it fetches a page", async () => {
    const fetch = vi.fn((params: PageParams) =>
      Promise.resolve(pageOf([params.pageIndex], params.pageIndex ?? 0, 10, 1)),
    );
    const query = pageQuery(["people", { status: "ACTIVE" }], fetch);
    const signal = new AbortController().signal;
    expect(query.queryKey).toEqual(["people", { status: "ACTIVE" }]);
    await query.fetch({ pageIndex: 3 }, signal);
    expect(fetch).toHaveBeenCalledWith({ pageIndex: 3 }, signal);
  });
});

describe("queryStringOf", () => {
  it("is empty without parameters", () => {
    expect(queryStringOf({})).toBe("");
  });

  it("names each given parameter", () => {
    expect(queryStringOf({ pageIndex: 2, sortBy: "NAME", sortDirection: "DESC" })).toBe(
      "?pageIndex=2&sortBy=NAME&sortDirection=DESC",
    );
  });

  it("encodes values", () => {
    expect(queryStringOf({ search: "a&b" })).toBe("?search=a%26b");
  });

  it("drops a blank search", () => {
    expect(queryStringOf({ search: "  " })).toBe("");
  });
});

describe("pageParamsOf", () => {
  it("sends the page and the table's sort", () => {
    expect(pageParamsOf({ pageIndex: 3, pageSize: 25 }, [{ id: "EMAIL", desc: true }])).toEqual({
      pageIndex: 3,
      pageSize: 25,
      sortBy: "EMAIL",
      sortDirection: "DESC",
    });
  });

  it("sorts ascending unless the column is descending", () => {
    expect(pageParamsOf({ pageIndex: 0, pageSize: 10 }, [{ id: "NAME", desc: false }]).sortDirection).toBe("ASC");
  });

  it("leaves the sort to the server when the table has none", () => {
    expect(pageParamsOf({ pageIndex: 0, pageSize: 10 }, [])).toEqual({ pageIndex: 0, pageSize: 10 });
  });
});

describe("searchTermOf", () => {
  it("is the trimmed text", () => {
    expect(searchTermOf("  ada ", 0)).toBe("ada");
  });

  it("is absent for blank text", () => {
    expect(searchTermOf("   ", 0)).toBeUndefined();
  });

  it("is absent until the text reaches the minimum length", () => {
    expect(searchTermOf("ad", 3)).toBeUndefined();
    expect(searchTermOf("ada", 3)).toBe("ada");
  });
});

describe("nextPageIndex", () => {
  it("is the next page when there is one", () => {
    expect(nextPageIndex(pageOf([1, 2], 0, 2, 5))).toBe(1);
  });

  it("is absent on the last page", () => {
    expect(nextPageIndex(pageOf([5], 2, 2, 5))).toBeUndefined();
  });
});

describe("rowRange", () => {
  it("counts the rows shown on a middle page", () => {
    expect(rowRange(pageOf([3, 4], 1, 2, 5).pagination, 2)).toEqual({ first: 3, last: 4, total: 5 });
  });

  it("counts a short last page", () => {
    expect(rowRange(pageOf([5], 2, 2, 5).pagination, 1)).toEqual({ first: 5, last: 5, total: 5 });
  });

  it("is all zeros when there are no rows", () => {
    expect(rowRange(pageOf([], 0, 2, 0).pagination, 0)).toEqual({ first: 0, last: 0, total: 0 });
  });
});

describe("fetchAllPages", () => {
  const rows = [1, 2, 3, 4, 5];

  function fetcher(params: PageParams): Promise<PageDto<number>> {
    const pageIndex = params.pageIndex ?? 0;
    const pageSize = params.pageSize ?? 20;
    return Promise.resolve(
      pageOf(rows.slice(pageIndex * pageSize, (pageIndex + 1) * pageSize), pageIndex, pageSize, rows.length),
    );
  }

  it("collects every page in order", async () => {
    await expect(fetchAllPages(fetcher, { pageSize: 2 })).resolves.toEqual([1, 2, 3, 4, 5]);
  });

  it("asks for pages of 100 by default, the most the server's paginator allows", async () => {
    const seen: PageParams[] = [];
    await fetchAllPages((params) => {
      seen.push(params);
      return fetcher(params);
    });
    expect(seen).toEqual([{ pageIndex: 0, pageSize: 100 }]);
  });

  it("keeps the other parameters on every request", async () => {
    const seen: PageParams[] = [];
    await fetchAllPages(
      (params) => {
        seen.push(params);
        return fetcher(params);
      },
      { pageSize: 2, sortBy: "NAME", search: "a" },
    );
    expect(seen.map((params) => params.pageIndex)).toEqual([0, 1, 2]);
    expect(seen.every((params) => params.sortBy === "NAME" && params.search === "a")).toBe(true);
  });

  it("stops with an error past the page limit, rather than fetching forever", async () => {
    const endless = (params: PageParams) =>
      Promise.resolve(pageOf([params.pageIndex ?? 0], params.pageIndex ?? 0, 1, 1_000_000));
    await expect(fetchAllPages(endless, {}, { maxPages: 3 })).rejects.toThrow("more than 3 pages");
  });

  it("allows 100 pages by default", async () => {
    const seen: number[] = [];
    const endless = (params: PageParams) => {
      seen.push(params.pageIndex ?? 0);
      return Promise.resolve(pageOf([1], params.pageIndex ?? 0, 1, 1_000_000));
    };
    await expect(fetchAllPages(endless)).rejects.toThrow("more than 100 pages");
    expect(seen).toHaveLength(100);
  });

  it("stops with an error when the server does not move to the next page", async () => {
    const stuck = () => Promise.resolve(pageOf([1], 0, 1, 5));
    await expect(fetchAllPages(stuck)).rejects.toThrow("page 0 again");
  });
});

describe("tableSearchOf", () => {
  const SORTS = ["NAME", "EMAIL"] as const;

  it("keeps a table's page, size, sort and search from the URL", () => {
    expect(
      tableSearchOf({ pageIndex: 2, pageSize: 50, sortBy: "EMAIL", sortDirection: "DESC", search: "ada" }, SORTS),
    ).toEqual({ pageIndex: 2, pageSize: 50, sortBy: "EMAIL", sortDirection: "DESC", search: "ada" });
  });

  it("is empty for an empty URL", () => {
    expect(tableSearchOf({}, SORTS)).toEqual({});
  });

  it("reads numbers written as text", () => {
    expect(tableSearchOf({ pageIndex: "3", pageSize: "10" }, SORTS)).toEqual({ pageIndex: 3, pageSize: 10 });
  });

  it("drops a page that is not a whole number from zero", () => {
    for (const pageIndex of [-1, 1.5, "x", Number.NaN, null, {}]) {
      expect(tableSearchOf({ pageIndex }, SORTS)).toEqual({});
    }
  });

  it("caps the page size at what a Paginator returns, and drops one below 1", () => {
    expect(tableSearchOf({ pageSize: 500 }, SORTS)).toEqual({ pageSize: 100 });
    expect(tableSearchOf({ pageSize: 0 }, SORTS)).toEqual({});
  });

  it("drops a sort the endpoint does not offer", () => {
    expect(tableSearchOf({ sortBy: "PASSWORD" }, SORTS)).toEqual({});
  });

  it("reads the direction in any case, and drops anything else", () => {
    expect(tableSearchOf({ sortDirection: "desc" }, SORTS)).toEqual({ sortDirection: "DESC" });
    expect(tableSearchOf({ sortDirection: "sideways" }, SORTS)).toEqual({});
  });

  it("names every key, so a dropped value hides the raw one a parent route passes down", () => {
    expect(Object.keys(tableSearchOf({ sortBy: "PASSWORD" }, SORTS)).sort()).toEqual([
      "pageIndex",
      "pageSize",
      "search",
      "sortBy",
      "sortDirection",
    ]);
  });

  it("trims the search, and drops a blank or non-text one", () => {
    expect(tableSearchOf({ search: "  ada " }, SORTS)).toEqual({ search: "ada" });
    expect(tableSearchOf({ search: "  " }, SORTS)).toEqual({});
    expect(tableSearchOf({ search: 42 }, SORTS)).toEqual({});
  });
});

describe("enumSearchOf", () => {
  const STATUSES = ["ACTIVE", "DEACTIVATED"] as const;

  it("keeps a value the list offers", () => {
    expect(enumSearchOf("DEACTIVATED", STATUSES)).toBe("DEACTIVATED");
  });

  it("drops anything else", () => {
    for (const raw of ["ASLEEP", "deactivated", "", undefined, 3, null]) {
      expect(enumSearchOf(raw, STATUSES)).toBeUndefined();
    }
  });
});

describe("idSearchOf", () => {
  const ID = "0b9f6c0e-4d3a-4f6e-9a57-1c2d3e4f5a6b";

  it("keeps a UUID, in either case", () => {
    expect(idSearchOf(ID)).toBe(ID);
    expect(idSearchOf(ID.toUpperCase())).toBe(ID.toUpperCase());
  });

  it("drops anything else", () => {
    for (const raw of ["", "ACTIVE", ` ${ID}`, `${ID} `, `x${ID}`, `${ID}0`, ID.replace("-", ""), undefined, 3, null]) {
      expect(idSearchOf(raw)).toBeUndefined();
    }
  });

  it("drops a non-string that only prints as a UUID", () => {
    expect(idSearchOf([ID])).toBeUndefined();
    expect(idSearchOf({ toString: () => ID })).toBeUndefined();
  });
});

describe("queryStringOf with filters", () => {
  it("carries extra parameters such as filters", () => {
    expect(queryStringOf({ pageIndex: 1, role: "OWNER", status: undefined })).toBe("?pageIndex=1&role=OWNER");
  });

  describe("tableSearchOf, at the edges", () => {
    const SORTS = ["NAME", "EMAIL"] as const;

    it("drops a page written as blank text", () => {
      for (const pageIndex of ["", "  "]) {
        expect(tableSearchOf({ pageIndex }, SORTS)).toEqual({});
      }
    });

    it("keeps the first page and the smallest page size", () => {
      expect(tableSearchOf({ pageIndex: 0, pageSize: 1 }, SORTS)).toEqual({ pageIndex: 0, pageSize: 1 });
    });

    it("reads an ascending direction in any case", () => {
      expect(tableSearchOf({ sortDirection: "asc" }, SORTS)).toEqual({ sortDirection: "ASC" });
    });
  });
});

describe("dateSearchOf", () => {
  it("keeps a real date", () => {
    expect(dateSearchOf("2026-11-17")).toBe("2026-11-17");
    expect(dateSearchOf("2028-02-29")).toBe("2028-02-29");
  });

  it.each(["2026-02-30", "2026-13-01", "2026-2-3", "tomorrow", "", "2026-11-17T10:00", " 2026-11-17"])(
    "drops %j",
    (raw) => {
      expect(dateSearchOf(raw)).toBeUndefined();
    },
  );

  it("drops what is not text", () => {
    expect(dateSearchOf(undefined)).toBeUndefined();
    expect(dateSearchOf(20261117)).toBeUndefined();
    expect(dateSearchOf(["2026-11-17"])).toBeUndefined();
    expect(dateSearchOf({ toString: () => "2026-11-17" })).toBeUndefined();
  });
});
