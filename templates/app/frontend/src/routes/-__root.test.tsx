// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getJson } from "@jwcarman/roux-web/api";
import { takeSignInReturn } from "@jwcarman/roux-web/signin";
import { rulesFor, server, serverError } from "@jwcarman/roux-web/testing";
import { USERS_READ } from "../permissions.gen";
import { renderRoute } from "../testing/route";

const GRACE = {
  id: "u-1",
  displayName: "Grace Hopper",
  email: "grace@example.org",
  role: "USER",
  status: "ACTIVE",
  joinedAt: "2026-11-01T12:00:00Z",
};

describe("the root route", () => {
  it("signs out from the account area and lands on sign-in", async () => {
    server.use(
      http.post("/who/logout", () => new HttpResponse(null, { status: 204 })),
      http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })),
      http.get("/who/me/passkeys", () => HttpResponse.json([])),
    );
    const { router } = renderRoute("/settings", { permissions: [] });
    await screen.findByRole("heading", { name: "Settings" });

    await userEvent.click(screen.getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    // Signing in again starts at Home, not the page they signed out on.
    expect(takeSignInReturn()).toBeUndefined();
  });

  it("remembers nothing as a signed-in caller moves between pages", async () => {
    server.use(http.get("/who/me/passkeys", () => HttpResponse.json([])));
    renderRoute("/settings", { permissions: [] });
    await screen.findByRole("heading", { name: "Settings" });

    expect(takeSignInReturn()).toBeUndefined();
  });

  it("remembers a page a signed-out visitor opens, for after signing in", async () => {
    server.use(http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })));
    const { router } = renderRoute("/settings", { permissions: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(takeSignInReturn()).toBe("/settings");
  });

  it("signs out from the phone's navigation drawer, closing it", async () => {
    server.use(
      http.post("/who/logout", () => new HttpResponse(null, { status: 204 })),
      http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })),
    );
    const { router } = renderRoute("/", { permissions: [] });
    // The menu button shows only on a phone's width, which jsdom does not have.
    await userEvent.click(await screen.findByRole("button", { name: "Open navigation", hidden: true }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });

    expect(within(drawer).getByText("Test User")).toBeInTheDocument();
    await userEvent.click(within(drawer).getByRole("button", { name: "Sign out" }));

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    await waitFor(() => expect(screen.queryByRole("dialog", { name: "Navigation" })).toBeNull());
  });

  it("says a page that does not exist was not found", async () => {
    renderRoute("/no-such-page", { permissions: [] });

    expect(await screen.findByRole("heading", { name: "Page not found" })).toBeInTheDocument();
  });

  it("shows the error page when a page fails to load, and retrying loads it again", async () => {
    let failing = true;
    server.use(
      http.get("/api/users/u-1", () => (failing ? serverError() : HttpResponse.json(GRACE))),
      http.get("/api/users/u-1/activities", () => HttpResponse.json({ data: [], next: null })),
    );
    renderRoute("/users/u-1", { permissions: [USERS_READ] });

    const retry = await screen.findByRole("button", { name: "Try again" });
    failing = false;
    await userEvent.click(retry);

    expect(await screen.findByRole("heading", { name: "Grace Hopper" })).toBeInTheDocument();
  });

  it("sends the caller to sign in when the session ends on the server", async () => {
    server.use(http.get("/who/sign-in", () => HttpResponse.json({ providers: [] })));
    const { router } = renderRoute("/", { permissions: [] });
    await screen.findByRole("heading", { name: "Home" });
    server.use(
      http.get("/who/me", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/anything", () => new HttpResponse(null, { status: 401 })),
    );

    // Any API call answering 401 says the session is gone.
    await getJson("/api/anything").catch(() => undefined);

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
  });

  it("stacks the account tools in the rail and lays them in a row in the sidebar and the drawer", async () => {
    renderRoute("/", { permissions: [] });
    const sidebar = await screen.findByRole("complementary");
    const signOut = within(sidebar).getByRole("button", { name: "Sign out" });

    const tools = rulesFor(signOut.parentElement!);
    expect(tools).toMatch(/min-width: 48rem\)[^}]*flex-direction:column/);
    expect(tools).toMatch(/min-width: 64rem\)[^}]*flex-direction:row/);
    const button = rulesFor(signOut);
    expect(button).toMatch(/min-width: 48rem\)[^}]*flex:none/);
    expect(button).toMatch(/min-width: 64rem\)[^}]*flex:1/);

    await userEvent.click(screen.getByRole("button", { name: "Open navigation", hidden: true }));
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });
    const inDrawer = within(drawer).getByRole("button", { name: "Sign out" });
    expect(rulesFor(inDrawer.parentElement!)).toContain("flex-direction:row");
    expect(rulesFor(inDrawer.parentElement!)).not.toContain("flex-direction:column");
    expect(rulesFor(inDrawer)).toContain("flex:1");
    expect(rulesFor(inDrawer)).not.toContain("flex:none");
  });

  it("puts the app's mark beside its name", async () => {
    renderRoute("/", { permissions: [] });
    const name = within(await screen.findByRole("complementary")).getByRole("heading", { level: 1 });
    expect(name.querySelector("svg rect")).not.toBeNull();
  });
});
