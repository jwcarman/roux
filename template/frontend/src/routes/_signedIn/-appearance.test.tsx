// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { THEME_MANAGE } from "../../permissions.gen";
import { renderRoute } from "../../testing/route";

describe("/appearance", () => {
  it("shows the appearance settings to someone who may change them", async () => {
    server.use(
      http.get("/api/theme", () =>
        HttpResponse.json({
          appName: "Test App",
          palette: "gray",
          brandColor: "#3b82f6",
          shape: "medium",
          headingFont: "standard",
          bodyFont: "standard",
          version: 0,
        }),
      ),
    );
    renderRoute("/appearance", { permissions: [THEME_MANAGE] });

    expect(await screen.findByRole("heading", { name: "Appearance" })).toBeInTheDocument();
  });

  it("sends someone who may not change them to Home", async () => {
    const { router } = renderRoute("/appearance", { permissions: [] });
    expect(await screen.findByRole("heading", { name: /^Welcome/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
