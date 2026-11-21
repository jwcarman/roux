// @vitest-environment jsdom
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getJson } from "@jwcarman/roux-web/api";
import { renderWithProviders, server } from "@jwcarman/roux-web/testing";
import { SessionProvider, useSession } from "./session";

/** Shows what the session holds, with buttons for what it does. */
function Probe() {
  const { me, profile, signOut } = useSession();
  return (
    <>
      <p>me: {me === undefined ? "loading" : me === null ? "signed out" : me.identityId}</p>
      <p>profile: {profile === undefined ? "loading" : profile === null ? "none" : profile.displayName}</p>
      <button onClick={() => void signOut()}>Sign out</button>
      <button onClick={() => void getJson("/api/anything").catch(() => undefined)}>Call the API</button>
    </>
  );
}

function signedIn() {
  let signedInNow = true;
  server.use(
    http.get("/who/me", () =>
      signedInNow ? HttpResponse.json({ identityId: "id-1", permissions: [] }) : new HttpResponse(null, { status: 401 }),
    ),
    http.get("/api/users/me", () =>
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
    server.use(http.get("/api/users/me", () => new HttpResponse(null, { status: 500 })));
    renderSession();

    expect(await screen.findByText("me: id-1")).toBeInTheDocument();
    expect(await screen.findByText("profile: none")).toBeInTheDocument();
  });

  it("has no profile for a signed-out caller", async () => {
    server.use(http.get("/who/me", () => new HttpResponse(null, { status: 401 })));
    renderSession();

    expect(await screen.findByText("me: signed out")).toBeInTheDocument();
    expect(await screen.findByText("profile: none")).toBeInTheDocument();
  });

  it("signs out through who", async () => {
    signedIn();
    let signedOut = false;
    server.use(
      http.post("/who/logout", () => {
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
    server.use(http.post("/who/logout", () => new HttpResponse(null, { status: 204 })));
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
      http.get("/who/me", () => {
        asked++;
        return new HttpResponse(null, { status: 401 });
      }),
      http.get("/api/anything", () => new HttpResponse(null, { status: 401 })),
    );

    await getJson("/api/anything").catch(() => undefined);

    expect(asked).toBe(0);
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
