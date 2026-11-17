import type { UseInfiniteQueryResult, UseQueryResult } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";
import type { PageDto, PageParams } from "./paging/paging";
import type { InfiniteListProps } from "./paging/InfiniteList";
import type { InfiniteSelectProps } from "./paging/InfiniteSelect";
import type { QueryTableProps } from "./table/QueryTable";
import type { SimpleQueryTableProps } from "./table/SimpleQueryTable";
import type { Person } from "./testing/fakeServer";

// The list components take the module's query (`pageQuery(...)`, `queryOptions(...)`), never a fetcher
// function or a query's result. These lines assert that the wrong way does not compile: each
// `@ts-expect-error` fails the type check if the line below it ever stops being an error. They are
// never run.

declare const fetcher: (params: PageParams, signal: AbortSignal) => Promise<PageDto<Person>>;
declare const wholeFetcher: (signal: AbortSignal) => Promise<Person[]>;
declare const pageResult: UseQueryResult<PageDto<Person>>;
declare const listResult: UseQueryResult<Person[]>;
declare const infiniteResult: UseInfiniteQueryResult<unknown>;

describe("the list components' query prop", () => {
  it("is the module's query, so a fetcher function or a useQuery result does not compile", () => {
    const attempts = [
      (): Pick<QueryTableProps<Person>, "query"> => ({
        // @ts-expect-error a fetcher function is not a PageQuery
        query: fetcher,
      }),
      (): Pick<QueryTableProps<Person>, "query"> => ({
        // @ts-expect-error a query's result is not a PageQuery
        query: pageResult,
      }),
      (): Pick<InfiniteListProps<Person>, "query"> => ({
        // @ts-expect-error a fetcher function is not a PageQuery
        query: fetcher,
      }),
      (): Pick<InfiniteListProps<Person>, "query"> => ({
        // @ts-expect-error an infinite query's result is not a PageQuery
        query: infiniteResult,
      }),
      (): Pick<InfiniteSelectProps<Person>, "query"> => ({
        // @ts-expect-error a fetcher function is not a PageQuery
        query: fetcher,
      }),
      (): Pick<InfiniteSelectProps<Person>, "query"> => ({
        // @ts-expect-error a query's result is not a PageQuery
        query: pageResult,
      }),
      (): Pick<SimpleQueryTableProps<Person>, "query"> => ({
        // @ts-expect-error a fetcher function is not the query's options
        query: wholeFetcher,
      }),
      (): Pick<SimpleQueryTableProps<Person>, "query"> => ({
        // @ts-expect-error a query's result is not the query's options
        query: listResult,
      }),
    ];
    expect(attempts).toHaveLength(8);
  });
});
