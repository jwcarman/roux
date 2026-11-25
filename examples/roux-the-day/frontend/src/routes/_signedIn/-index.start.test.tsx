// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { LuUsers } from "react-icons/lu";
import { describe, expect, it, vi } from "vitest";
import { defineNav } from "@jwcarman/roux-web/navigation";
import { pageOf, server } from "@jwcarman/roux-web/testing";
import { PERMISSIONS, USERS_READ } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

// An app whose start place is not Home (so Home is not in its navigation): opening the app goes there.
vi.mock("../../shell/nav", () => ({
  nav: defineNav(PERMISSIONS, [
    {
      label: "Users",
      to: "/users",
      icon: LuUsers,
      permission: "users.read",
      description: "Who.",
      start: true,
    },
  ]),
}));

describe("opening the app when another page is the start", () => {
  it("goes to the start page", async () => {
    server.use(http.get("/api/roux/users", () => HttpResponse.json(pageOf([], {}))));
    const { router } = renderRoute("/", { permissions: [USERS_READ] });
    await waitFor(() => expect(router.state.location.pathname).toBe("/users"));
  });

  it("shows Home itself, not the start page, to a caller a guard turned away", async () => {
    // May open the start page (Users) but not Appearance: Appearance's guard sends them to Home.
    const { router } = renderRoute("/appearance", {
      permissions: [USERS_READ],
    });
    expect(await screen.findByRole("heading", { name: /^Welcome/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
