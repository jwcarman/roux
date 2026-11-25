// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getJson } from "../api/client";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { SessionProvider, useSession } from "./session";

/** Shows what the session holds, with buttons for what it does. */
function Probe() {
  const { me, profile, signOut } = useSession();
  return (
    <>
      <p>me: {me === undefined ? "loading" : me === null ? "signed out" : me.identityId}</p>
      <p>profile: {profile === undefined ? "loading" : profile === null ? "none" : profile.displayName}</p>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={() => void getJson("anything").catch(() => undefined)}>Call the API</button>
    </>
  );
}

function signedIn() {
  let signedInNow = true;
  server.use(
    http.get("/api/roux/auth/me", () =>
      signedInNow
        ? HttpResponse.json({ identityId: "id-1", permissions: [] })
        : new HttpResponse(null, { status: 401 }),
    ),
    http.get("/api/roux/users/me", () =>
      HttpResponse.json({ id: "id-1", displayName: "Test User", email: "test@example.org", version: 0 }),
    ),
  );
  return () => {
    signedInNow = false;
  };
}

function renderSession() {
  renderWithProviders(
    <SessionProvider>
      <Probe />
    </SessionProvider>,
  );
}

describe("SessionProvider", () => {
  it("loads the caller and their profile", async () => {
    signedIn();
    renderSession();

    expect(await screen.findByText("me: id-1")).toBeInTheDocument();
    expect(await screen.findByText("profile: Test User")).toBeInTheDocument();
  });

  it("has no profile when it cannot be loaded", async () => {
    signedIn();
    server.use(http.get("/api/roux/users/me", () => new HttpResponse(null, { status: 500 })));
    renderSession();

    expect(await screen.findByText("me: id-1")).toBeInTheDocument();
    expect(await screen.findByText("profile: none")).toBeInTheDocument();
  });

  it("has no profile for a signed-out caller", async () => {
    server.use(http.get("/api/roux/auth/me", () => new HttpResponse(null, { status: 401 })));
    renderSession();

    expect(await screen.findByText("me: signed out")).toBeInTheDocument();
    expect(await screen.findByText("profile: none")).toBeInTheDocument();
  });

  it("signs out through the server", async () => {
    signedIn();
    let signedOut = false;
    server.use(
      http.post("/api/roux/auth/logout", () => {
        signedOut = true;
        return new HttpResponse(null, { status: 204 });
      }),
    );
    renderSession();
    await screen.findByText("me: id-1");

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    expect(await screen.findByText("me: signed out")).toBeInTheDocument();
    expect(signedOut).toBe(true);
  });

  it("asks who again when an API call finds the session gone", async () => {
    const endSession = signedIn();
    server.use(http.get("/api/anything", () => new HttpResponse(null, { status: 401 })));
    renderSession();
    await screen.findByText("me: id-1");
    endSession();

    await userEvent.click(screen.getByRole("button", { name: "Call the API" }));

    await waitFor(() => expect(screen.getByText("me: signed out")).toBeInTheDocument());
  });
});

describe("SessionProvider and the query cache", () => {
  it("keeps what was cached before the session loaded, and empties it on signing out", async () => {
    signedIn();
    server.use(http.post("/api/roux/auth/logout", () => new HttpResponse(null, { status: 204 })));
    const { client } = renderWithProviders(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    client.setQueryData(["cached"], "rows");
    await screen.findByText("me: id-1");
    expect(client.getQueryData(["cached"])).toBe("rows");

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await screen.findByText("me: signed out");
    expect(client.getQueryData(["cached"])).toBeUndefined();
  });

  it("stops listening for a lost session once it is gone", async () => {
    signedIn();
    let asked = 0;
    const { unmount } = renderWithProviders(
      <SessionProvider>
        <Probe />
      </SessionProvider>,
    );
    await screen.findByText("me: id-1");
    unmount();
    server.use(
      http.get("/api/roux/auth/me", () => {
        asked++;
        return new HttpResponse(null, { status: 401 });
      }),
      http.get("/api/anything", () => new HttpResponse(null, { status: 401 })),
    );

    await getJson("anything").catch(() => undefined);

    expect(asked).toBe(0);
  });
});

describe("the session's calls", () => {
  it("answers the caller through currentMe as soon as it has loaded, for route guards", async () => {
    signedIn();
    let seen: unknown;
    function Guard() {
      const { me, currentMe } = useSession();
      if (me) {
        seen = currentMe();
      }
      return null;
    }
    renderWithProviders(
      <SessionProvider>
        <Guard />
      </SessionProvider>,
    );

    await waitFor(() => expect(seen).toEqual({ identityId: "id-1", permissions: [] }));
  });

  it("reloads the profile with refreshProfile, as after a rename", async () => {
    signedIn();
    function Rename() {
      const { profile, refreshProfile } = useSession();
      return (
        <>
          <p>profile: {profile?.displayName ?? "loading"}</p>
          <button onClick={() => void refreshProfile()}>Reload</button>
        </>
      );
    }
    renderWithProviders(
      <SessionProvider>
        <Rename />
      </SessionProvider>,
    );
    await screen.findByText("profile: Test User");
    server.use(
      http.get("/api/roux/users/me", () =>
        HttpResponse.json({ id: "id-1", displayName: "Renamed", email: "test@example.org", version: 1 }),
      ),
    );

    await userEvent.click(screen.getByRole("button", { name: "Reload" }));

    expect(await screen.findByText("profile: Renamed")).toBeInTheDocument();
  });
});

describe("useSession", () => {
  it("refuses to run outside a SessionProvider", () => {
    function Outside() {
      useSession();
      return null;
    }
    expect(() => render(<Outside />)).toThrow("useSession outside SessionProvider");
  });
});
