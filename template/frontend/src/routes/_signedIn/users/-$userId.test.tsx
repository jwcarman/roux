// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { pageOf } from "@jwcarman/roux-web/testing";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { notFound, server } from "@jwcarman/roux-web/testing";
import { USERS_MANAGE, USERS_READ } from "../../../permissions.gen";
import { renderRoute } from "../../../testing/route";

const GRACE = {
  id: "u-1",
  displayName: "Grace Hopper",
  email: "grace@example.org",
  role: "USER",
  status: "ACTIVE",
  joinedAt: "2026-11-01T12:00:00Z",
};

describe("/users/$userId", () => {
  it("shows the user", async () => {
    server.use(
      http.get("/api/users/u-1", () => HttpResponse.json(GRACE)),
      http.get("/api/users/u-1/activities", () => HttpResponse.json({ data: [], next: null })),
    );
    renderRoute("/users/u-1", { permissions: [USERS_READ] });

    expect(await screen.findByRole("heading", { name: "Grace Hopper" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "All users" })).toHaveAttribute("href", "/users");
  });

  it("says a user who does not exist was not found", async () => {
    server.use(http.get("/api/users/nobody", () => notFound("No such user")));
    renderRoute("/users/nobody", { permissions: [USERS_READ] });

    expect(await screen.findByRole("heading", { name: "User not found" })).toBeInTheDocument();
  });

  /** Opens `user`'s page as the caller "id-1" holding `permissions`. */
  async function open(user: typeof GRACE, permissions: string[]) {
    server.use(
      http.get(`/api/users/${user.id}`, () => HttpResponse.json(user)),
      http.get(`/api/users/${user.id}/activities`, () => HttpResponse.json(pageOf([], {}))),
    );
    renderRoute(`/users/${user.id}`, { permissions });
    await screen.findByRole("heading", { name: user.displayName });
  }

  it("offers Deactivate to someone who manages users", async () => {
    await open(GRACE, [USERS_READ, USERS_MANAGE]);
    expect(screen.getByRole("button", { name: "Deactivate" })).toBeInTheDocument();
  });

  it("does not offer Deactivate to someone who only reads users", async () => {
    await open(GRACE, [USERS_READ]);
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("does not offer a manager Deactivate on their own page", async () => {
    await open({ ...GRACE, id: "id-1" }, [USERS_READ, USERS_MANAGE]);
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("sends someone who may not read users to Home", async () => {
    const { router } = renderRoute("/users/u-1", { permissions: [] });
    expect(await screen.findByRole("heading", { name: /^Welcome/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
