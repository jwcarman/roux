// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { testOrganization } from "@jwcarman/roux-web/organization";
import { server } from "@jwcarman/roux-web/testing";

/** The page as the server sends it: the organization's context, and the element the app renders into. */
function page(context: string) {
  document.body.innerHTML = `<script type="application/json" id="app-context">${context}</script><div id="root"></div>`;
}

beforeEach(() => {
  vi.resetModules();
});

describe("main", () => {
  it("starts the app from the page's context, on sign-in for a signed-out visitor", async () => {
    // A day that has not ended, so the day watch asks for no new one.
    page(JSON.stringify(testOrganization({ todayEndsAt: "2999-01-01T00:00:00Z" })));
    server.use(
      http.get("/api/roux/auth/me", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })),
    );

    await import("./main");

    expect(await screen.findByRole("heading", { level: 1, name: /^Sign in to / })).toBeInTheDocument();
  });

  it("says on the page why the app could not start", async () => {
    page("not json");

    await expect(import("./main")).rejects.toThrow("is not JSON");

    expect(document.getElementById("root")).toHaveTextContent(/^The app could not start: Error: .*is not JSON$/);
  });

  it("shows a spinner until the session has loaded", async () => {
    page(JSON.stringify(testOrganization({ todayEndsAt: "2999-01-01T00:00:00Z" })));
    server.use(http.get("/api/roux/auth/me", () => new Promise<Response>(() => undefined)));

    await import("./main");

    expect(await screen.findByLabelText("Loading")).toBeInTheDocument();
  });

  it("asks for the next day once the organization's day has ended", async () => {
    page(JSON.stringify(testOrganization({ todayEndsAt: "2000-01-01T00:00:00Z" })));
    let asked = 0;
    server.use(
      http.get("/api/roux/auth/me", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })),
      http.get("/api/roux/organization", () => {
        asked++;
        return HttpResponse.json(testOrganization({ todayEndsAt: "2999-01-01T00:00:00Z" }));
      }),
    );

    await import("./main");

    await waitFor(() => expect(asked).toBe(1));
  });
});
