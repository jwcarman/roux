// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { server, settle } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../../testing/route";

describe("/signin", () => {
  it("offers sign-in by email and by passkey under the app's name", async () => {
    server.use(http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })));
    renderRoute("/signin", { permissions: null });

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.getByRole("banner")).toHaveTextContent(/\S/);
  });

  it("offers only the emailed link and a passkey, even when who has other providers", async () => {
    server.use(
      http.get("/who/sign-in", () =>
        HttpResponse.json({ email: true, passkey: true, providers: [{ id: "google", name: "Google" }] }),
      ),
    );
    renderRoute("/signin", { permissions: null });

    expect(await screen.findByRole("heading", { name: "Sign in" })).toBeInTheDocument();
    await settle();
    expect(screen.getByRole("button", { name: /passkey/i })).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).toBeNull();
  });

  it("signs in from the emailed link's page", async () => {
    renderRoute("/signin/link", { permissions: null });
    expect(await screen.findByRole("heading", { name: "Signing you in" })).toBeInTheDocument();
  });

  it("sends someone already signed in to Home", async () => {
    const { router } = renderRoute("/signin", { permissions: [] });
    expect(await screen.findByRole("heading", { name: "Home" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/");
  });
});
