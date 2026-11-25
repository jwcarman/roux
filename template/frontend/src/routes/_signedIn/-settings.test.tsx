// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { http, HttpResponse } from "msw";
import { server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../../testing/route";

async function openSettings() {
  const rendered = renderRoute("/settings", { permissions: [] });
  await screen.findByRole("heading", { level: 2, name: "Settings" });
  return rendered;
}

// The passkeys section itself is roux-web's PasskeySettings, tested there; this page composes it.
describe("/settings", () => {
  it("has a section for the profile and one for passkeys, each saying what it is for", async () => {
    server.use(
      http.get("/api/roux/auth/me/passkeys", () => HttpResponse.json([])),
    );
    await openSettings();
    expect(
      screen.getByRole("heading", { level: 3, name: "Profile" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/^How you appear to others in /),
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "Passkeys" }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("Sign in with your fingerprint, face or device PIN."),
    ).toBeInTheDocument();
    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
    expect(
      screen.getByRole("button", { name: "Add a passkey" }),
    ).toBeInTheDocument();
  });

  it("asks the session again when the passkeys find it signed out", async () => {
    let asked = 0;
    server.use(
      http.get("/api/roux/auth/me/passkeys", () => {
        server.use(
          http.get("/api/roux/auth/me", () => {
            asked++;
            return HttpResponse.json({ identityId: "id-1", permissions: [] });
          }),
        );
        return new HttpResponse(null, { status: 401 });
      }),
    );
    await openSettings();

    await waitFor(() => expect(asked).toBeGreaterThan(0));
  });
});
