// @vitest-environment jsdom
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "../testing/server";
import { historyQuery } from "./history";

const PAGE = {
  data: [],
  pagination: {
    pageIndex: 2,
    pageSize: 20,
    totalElementCount: 0,
    totalPageCount: 0,
    hasNext: false,
    hasPrevious: true,
  },
};

describe("historyQuery", () => {
  it("keeps the app's key, so the history refreshes with its record", () => {
    expect(historyQuery(["students", "detail", "s1", "activities"], "students/s1/activities").queryKey).toEqual([
      "students",
      "detail",
      "s1",
      "activities",
    ]);
  });

  it("asks the history's endpoint for the page it is given, the first unless told", async () => {
    const asked: (string | null)[] = [];
    server.use(
      http.get("/api/students/s1/activities", ({ request }) => {
        asked.push(new URL(request.url).searchParams.get("pageIndex"));
        return HttpResponse.json(PAGE);
      }),
    );
    const query = historyQuery(["history"], "students/s1/activities");

    expect(await query.fetch({ pageIndex: 2 }, new AbortController().signal)).toEqual(PAGE);
    await query.fetch({}, new AbortController().signal);

    expect(asked).toEqual(["2", "0"]);
  });
});
