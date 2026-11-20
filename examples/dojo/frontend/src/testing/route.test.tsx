// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { renderRoute } from "./route";
import { server } from "./server";

describe("renderRoute", () => {
  it("opens the path for a signed-in caller", async () => {
    renderRoute("/", { permissions: [] });

    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
  });

  it("starts at the path it was given", async () => {
    const { router } = renderRoute("/?home=true", { permissions: [] });

    await screen.findByRole("heading", { name: "Home" });
    expect(router.state.location.search).toEqual({ home: true });
  });

  it("opens the path signed out when permissions is null", async () => {
    // The sign-in page asks who which providers are on; answered, the test does not race it.
    server.use(http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })));
    const { router } = renderRoute("/", { permissions: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
  });
});
