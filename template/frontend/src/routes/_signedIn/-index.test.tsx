// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { delay, http, HttpResponse } from "msw";
import { describe, expect, it, vi } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { USERS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

describe("Home", () => {
  it("welcomes the signed-in user by name, in the page's heading", async () => {
    renderRoute("/", { permissions: [] });

    expect(await screen.findByRole("heading", { level: 2, name: "Welcome, Test User" })).toBeInTheDocument();
  });

  it("welcomes a caller who has no profile to show without a name", async () => {
    renderRoute("/", { permissions: [] });
    // After renderRoute's own answer, which this replaces; the session asks once it knows the caller.
    let asked = false;
    server.use(
      http.get("/api/roux/users/me", () => {
        asked = true;
        return new HttpResponse(null, { status: 404 });
      }),
    );

    await vi.waitFor(() => expect(asked).toBe(true));
    await delay(50);
    expect(screen.getByRole("heading", { level: 2, name: "Welcome" })).toBeInTheDocument();
  });

  it("says which app they are signed in to", async () => {
    renderRoute("/", { permissions: [] });

    expect(await screen.findByText(/^You're signed in to .+\.$/)).toBeInTheDocument();
  });

  it("is a blank page to start from: no links of its own", async () => {
    renderRoute("/", { permissions: [USERS_READ] });

    await screen.findByRole("heading", { name: "Welcome, Test User" });
    expect(screen.getByRole("main").querySelectorAll("a")).toHaveLength(0);
  });
});
