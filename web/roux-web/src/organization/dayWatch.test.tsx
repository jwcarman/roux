// @vitest-environment jsdom
import { QueryClient } from "@tanstack/react-query";
import { act, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { startDayWatch, RETRY_MS } from "./dayWatch";
import { clearOrganization, organization, setOrganization, testOrganization, today, type OrganizationContext } from "./organization";
import { useToday } from "./useToday";

const DAY = testOrganization(); // 2026-06-15, ends 2026-06-16T04:00:00Z
const NEXT: OrganizationContext = { ...DAY, today: "2026-06-16", todayEndsAt: "2026-06-17T04:00:00Z" };
const END = Date.parse(DAY.todayEndsAt);

function Today() {
  return <p>{useToday()}</p>;
}

function visibility(state: DocumentVisibilityState) {
  Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  document.dispatchEvent(new Event("visibilitychange"));
}

let queryClient: QueryClient;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"] });
  vi.setSystemTime(END - 60 * 60 * 1000); // an hour before the day ends
  setOrganization(DAY);
  queryClient = new QueryClient();
  vi.spyOn(queryClient, "invalidateQueries");
});

afterEach(() => {
  vi.useRealTimers();
  visibility("visible");
  clearOrganization();
});

describe("startDayWatch", () => {
  it("takes the new day when today ends, refreshes every query and re-renders", async () => {
    const fetchContext = vi.fn(async () => NEXT);
    render(<Today />);
    const stop = startDayWatch(queryClient, fetchContext);

    await act(() => vi.advanceTimersByTimeAsync(60 * 60 * 1000 - 1));
    expect(fetchContext).not.toHaveBeenCalled();
    await act(() => vi.advanceTimersByTimeAsync(1));

    expect(fetchContext).toHaveBeenCalledOnce();
    expect(today()).toBe("2026-06-16");
    expect(queryClient.invalidateQueries).toHaveBeenCalledOnce();
    expect(screen.getByText("2026-06-16")).toBeInTheDocument();
    stop();
  });

  it("watches for the next day after taking one", async () => {
    const fetchContext = vi.fn(async () => (fetchContext.mock.calls.length === 1 ? NEXT : { ...NEXT, today: "2026-06-17" }));
    const stop = startDayWatch(queryClient, fetchContext);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    await vi.advanceTimersByTimeAsync(24 * 60 * 60 * 1000);

    expect(today()).toBe("2026-06-17");
    stop();
  });

  it("keeps the day and retries a minute later when the server fails", async () => {
    const fetchContext = vi.fn().mockRejectedValueOnce(new Error("offline")).mockResolvedValue(NEXT);
    const stop = startDayWatch(queryClient, fetchContext);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(today()).toBe("2026-06-15");
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(fetchContext).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(1);
    expect(today()).toBe("2026-06-16");
    expect(RETRY_MS).toBe(60_000);
    stop();
  });

  it("keeps the day and retries when the server still says today", async () => {
    const fetchContext = vi.fn().mockResolvedValueOnce({ ...DAY }).mockResolvedValue(NEXT);
    const stop = startDayWatch(queryClient, fetchContext);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(organization()).toBe(DAY);
    expect(queryClient.invalidateQueries).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(RETRY_MS - 1);
    expect(fetchContext).toHaveBeenCalledOnce();
    await vi.advanceTimersByTimeAsync(RETRY_MS);
    expect(today()).toBe("2026-06-16");
    stop();
  });

  it("asks when a tab becomes visible after the day ended", async () => {
    const fetchContext = vi.fn(async () => NEXT);
    const stop = startDayWatch(queryClient, fetchContext);

    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchContext).not.toHaveBeenCalled(); // the day has not ended

    vi.setSystemTime(END + 1000); // asleep through the end: no timer fired
    visibility("hidden");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchContext).not.toHaveBeenCalled();

    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchContext).toHaveBeenCalledOnce();
    expect(today()).toBe("2026-06-16");

    // The timer set for the old day's end was replaced, not left to ask again.
    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    expect(fetchContext).toHaveBeenCalledOnce();
    stop();
  });

  it("asks when a tab becomes visible exactly as the day ends", async () => {
    const fetchContext = vi.fn(async () => NEXT);
    const stop = startDayWatch(queryClient, fetchContext);

    vi.setSystemTime(END);
    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);
    expect(fetchContext).toHaveBeenCalledOnce();
    stop();
  });

  it("stopped before the day ends, it never asks", async () => {
    const fetchContext = vi.fn(async () => NEXT);
    startDayWatch(queryClient, fetchContext)();

    await vi.advanceTimersByTimeAsync(2 * 60 * 60 * 1000);
    expect(fetchContext).not.toHaveBeenCalled();
  });

  it("stopped while a failing request is in flight, it does not retry", async () => {
    let fail: (error: Error) => void = () => undefined;
    const fetchContext = vi.fn(() => new Promise<OrganizationContext>((_, reject) => (fail = reject)));
    const stop = startDayWatch(queryClient, fetchContext);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    stop();
    fail(new Error("offline"));
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    expect(fetchContext).toHaveBeenCalledOnce();
  });

  it("stops: no timer, no visibility check, and an answer in flight is dropped", async () => {
    let answer: (context: OrganizationContext) => void = () => undefined;
    const fetchContext = vi.fn(() => new Promise<OrganizationContext>((resolve) => (answer = resolve)));
    const stop = startDayWatch(queryClient, fetchContext);

    await vi.advanceTimersByTimeAsync(60 * 60 * 1000);
    stop();
    answer(NEXT);
    await vi.advanceTimersByTimeAsync(RETRY_MS * 2);
    vi.setSystemTime(END + 1000);
    visibility("visible");
    await vi.advanceTimersByTimeAsync(0);

    expect(fetchContext).toHaveBeenCalledOnce();
    expect(today()).toBe("2026-06-15");
  });

  it("asks the server by default", async () => {
    const { server } = await import("../testing/server");
    const { http, HttpResponse } = await import("msw");
    server.use(http.get("/api/organization", () => HttpResponse.json(NEXT)));
    vi.useRealTimers();
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "Date"], shouldAdvanceTime: true });
    vi.setSystemTime(END + 1000);
    const stop = startDayWatch(queryClient);

    await vi.waitFor(() => expect(today()).toBe("2026-06-16"));
    stop();
  });
});
