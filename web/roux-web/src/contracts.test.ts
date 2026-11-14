// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { afterEach, describe, expect, it, vi } from "vitest";
import { onSessionLost, send } from "./api/client";
import { apiSettings } from "./api/config";
import { nextPageIndex, pageQuery, rowRange, type PageDto, type PageParams, type SortDirection } from "./paging/paging";
import { problemOf, type Problem } from "./problem/problem";
import { contract, contractNames } from "./testing/contracts";
import { server } from "./testing/server";

interface PageParamsCase {
  query: string;
  pageIndex: number | null;
  pageSize: number | null;
  sortBy: string | null;
  sortDirection: SortDirection | null;
}

interface Session {
  csrfBootstrapPath: string;
  sessionPathPrefix: string;
  csrfCookie: string;
  csrfHeader: string;
  sessionLostStatus: number;
}

const problemFixtures = contractNames("problem-");
const pageParams = contract<PageParamsCase[]>("page-params.json").map((entry) => [entry.query, entry] as const);
const session = contract<Session>("session.json");

describe("the shared contracts", () => {
  afterEach(() => {
    document.cookie = `${session.csrfCookie}=; expires=Thu, 01 Jan 1970 00:00:00 GMT`;
  });

  it("covers every problem fixture", () => {
    expect(problemFixtures).toHaveLength(6);
  });

  // The fixtures leave `type` out, which RFC 9457 reads as "about:blank"; problemOf says so explicitly.
  it.each(problemFixtures)("problemOf reads %s exactly", async (name) => {
    const fixture = contract<Omit<Problem, "type">>(name);

    const problem = await problemOf(
      new Response(JSON.stringify(fixture), {
        status: fixture.status,
        headers: { "Content-Type": "application/problem+json" },
      }),
    );

    expect(problem).toEqual({ type: "about:blank", ...fixture });
  });

  it("page.json is a PageDto", () => {
    const page = contract<PageDto<{ id: string; name: string }>>("page.json") satisfies PageDto<{
      id: string;
      name: string;
    }>;

    expect(nextPageIndex(page)).toBe(1);
    expect(rowRange(page.pagination, 2)).toEqual({ first: 1, last: 2, total: 3 });
  });

  it.each(pageParams)("pageQuery sends %s", (query, entry) => {
    const params: PageParams & Record<string, string | number | undefined> = {};
    if (entry.pageIndex !== null) params.pageIndex = entry.pageIndex;
    if (entry.pageSize !== null) params.pageSize = entry.pageSize;
    if (entry.sortBy !== null) params.sortBy = entry.sortBy;
    if (entry.sortDirection !== null) params.sortDirection = entry.sortDirection;

    expect(pageQuery(params)).toBe(query);
  });

  it("session.json matches the client", async () => {
    expect(apiSettings()).toEqual({
      baseUrl: "/api",
      csrfBootstrapPath: session.csrfBootstrapPath,
      sessionPathPrefix: session.sessionPathPrefix,
    });

    let token: string | null = null;
    server.use(
      http.get(session.csrfBootstrapPath, () => {
        document.cookie = `${session.csrfCookie}=t0ken`;
        return new HttpResponse(null, { status: 200 });
      }),
      http.post(`${session.sessionPathPrefix}x`, ({ request }) => {
        token = request.headers.get(session.csrfHeader);
        return new HttpResponse(null, { status: session.sessionLostStatus });
      }),
    );
    const lost = vi.fn<() => void>();
    const unsubscribe = onSessionLost(lost);

    await send("POST", `${session.sessionPathPrefix}x`);

    expect(token).toBe("t0ken");
    expect(lost).toHaveBeenCalledOnce();
    unsubscribe();
  });
});
