// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../../testing/route";

describe("/signin", () => {
  it("offers sign-in by email and by passkey on a card named for the app, with the mode switch", async () => {
    server.use(
      http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ email: true, passkey: true, providers: [] })),
    );
    renderRoute("/signin", { permissions: null });

    expect(await screen.findByRole("heading", { level: 1, name: /^Sign in to \S/ })).toBeInTheDocument();
    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Switch to (dark|light) mode/ })).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("textbox", { name: "Email" }));
    expect(screen.queryByRole("banner")).toBeNull();
  });

  it("offers each provider who has on, on the same card", async () => {
    server.use(
      http.get("/api/roux/auth/sign-in", () =>
        HttpResponse.json({
          email: true,
          passkey: true,
          providers: [{ id: "google", name: "Google" }],
        }),
      ),
    );
    renderRoute("/signin", { permissions: null });

    expect(await screen.findByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.getByText("Other ways to sign in")).toBeInTheDocument();
  });

  it("signs in from the emailed link's page", async () => {
    renderRoute("/signin/link", { permissions: null });
    expect(await screen.findByRole("heading", { level: 1, name: "Signing you in" })).toBeInTheDocument();
    expect(screen.getByRole("main")).toContainElement(screen.getByRole("heading", { name: "Signing you in" }));
  });

  it("sends someone already signed in to Home", async () => {
    const { router } = renderRoute("/signin", { permissions: [] });
    expect(await screen.findByRole("heading", { name: /^Welcome/ })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
