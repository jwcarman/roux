// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { ATTENDANCE_RECORD, CLASSES_READ } from "../api";
import { renderRoute } from "../testing/route";
import { server } from "../testing/server";
import { takeReturn } from "./returnTo";

/** What the server answers once the emailed link's token is sent. */
function answerTheLink() {
  server.use(
    http.post("/who/email/sign-in", () => new HttpResponse(null, { status: 204 })),
    http.get("/who/me", () => HttpResponse.json({ identityId: "id-1", permissions: [CLASSES_READ, ATTENDANCE_RECORD] })),
  );
}

describe("a deep link opened signed out", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    localStorage.clear();
  });

  afterEach(() => {
    window.history.replaceState({}, "", "/");
    localStorage.clear();
  });

  it("goes to sign in, and remembers the page with its date", async () => {
    const { router } = renderRoute("/classes/c1/check-in?date=2026-03-10", { permissions: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(await screen.findByRole("heading", { name: "Sign in", level: 2 })).toBeInTheDocument();
    expect(takeReturn()).toBe("/classes/c1/check-in?date=2026-03-10");
  });

  it("the timetable too", async () => {
    const { router } = renderRoute("/timetable", { permissions: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(takeReturn()).toBe("/timetable");
  });

  it("signing in by the emailed link goes back to the page, date and all", async () => {
    server.use(
      http.get("/api/classes/c1", () =>
        HttpResponse.json({
          id: "c1",
          name: "Tuesday Karate",
          weekday: "TUESDAY",
          startsAt: "17:00",
          endsAt: "18:00",
          instructorId: null,
          instructorName: null,
          version: 0,
        }),
      ),
      http.get("/api/classes/c1/check-in", () => HttpResponse.json([])),
    );
    const { router } = renderRoute("/classes/c1/check-in?date=2026-03-10", { permissions: null, browserHistory: true });
    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));

    // the link's page reads its token from the address bar and takes it out again: only the
    // browser's own history does that, and it once took the page's search with it
    answerTheLink();
    await router.navigate({ to: "/signin/link", hash: "token=abc" });
    await waitFor(() => expect(router.state.location.pathname).toBe("/classes/c1/check-in"));

    expect(router.state.location.search).toEqual({ date: "2026-03-10" });
    expect(window.location.search).toBe("?date=2026-03-10");
    expect(await screen.findByRole("heading", { name: "Check in: Tuesday Karate" })).toBeInTheDocument();
    expect(takeReturn()).toBeUndefined();
  });

  it("signing in with nothing remembered goes Home", async () => {
    const { router } = renderRoute("/signin/link#token=abc", { permissions: null, browserHistory: true });
    answerTheLink();

    await waitFor(() => expect(router.state.location.pathname).toBe("/"));
    expect(await screen.findByRole("heading", { name: "Home", level: 2 })).toBeInTheDocument();
  });
});
