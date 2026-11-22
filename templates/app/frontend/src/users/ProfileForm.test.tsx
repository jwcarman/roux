// @vitest-environment jsdom
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { Toaster, toaster } from "@jwcarman/roux-web/feedback";
import type { Profile } from "@jwcarman/roux-web/session";
import { SessionProvider } from "@jwcarman/roux-web/session";
import { renderWithProviders, server, serverError, stale } from "@jwcarman/roux-web/testing";
import { ProfileForm } from "./ProfileForm";

/** The signed-in user's profile, as last saved; a rename at another version is a 409. */
function serveProfile() {
  let current: Profile = { displayName: "Ada Lovelace", email: "ada@example.com", version: 2 };
  const renames: unknown[] = [];
  server.use(
    http.get("/who/me", () => HttpResponse.json({ identityId: "id-1", permissions: [] })),
    http.get("/api/users/me", () => HttpResponse.json(current)),
    http.put("/api/users/me", async ({ request }) => {
      const body = (await request.json()) as { displayName: string; version: number };
      renames.push(body);
      if (body.version !== current.version) {
        return stale();
      }
      current = { ...current, displayName: body.displayName, version: body.version + 1 };
      return HttpResponse.json(current);
    }),
  );
  const renameElsewhere = (displayName: string) => {
    current = { ...current, displayName, version: current.version + 1 };
  };
  return { renames, renameElsewhere };
}

async function show() {
  renderWithProviders(
    <SessionProvider>
      <ProfileForm />
      <Toaster />
    </SessionProvider>,
  );
  const user = userEvent.setup();
  const name = await screen.findByRole("textbox", { name: "Display name" });
  return { user, name };
}

describe("ProfileForm", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("shows the email as text, as it cannot be changed here", async () => {
    serveProfile();
    await show();
    expect(screen.getByText("ada@example.com")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).toBeNull();
  });

  it("renames at the profile's version", async () => {
    const { renames } = serveProfile();
    const { user, name } = await show();

    await user.clear(name);
    await user.type(name, "Ada King");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Profile saved")).toBeInTheDocument();
    expect(renames).toEqual([{ displayName: "Ada King", version: 2 }]);
  });

  it("starts over from the reloaded profile when it changed elsewhere first", async () => {
    const { renames, renameElsewhere } = serveProfile();
    const { user, name } = await show();
    renameElsewhere("Countess of Lovelace");

    await user.clear(name);
    await user.type(name, "Ada King");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("This record changed since you loaded it")).toBeInTheDocument();
    await waitFor(() => expect(name).toHaveValue("Countess of Lovelace"));

    await user.click(screen.getByRole("button", { name: "Save profile" }));
    await waitFor(() => expect(renames).toHaveLength(2));
    expect(renames[1]).toEqual({ displayName: "Countess of Lovelace", version: 3 });
  });

  it("says the profile could not be saved when the server fails", async () => {
    serveProfile();
    server.use(http.put("/api/users/me", () => serverError()));
    const { user, name } = await show();

    await user.type(name, " King");
    await user.click(screen.getByRole("button", { name: "Save profile" }));

    expect(await screen.findByText("Could not save the profile")).toBeInTheDocument();
  });
});
