// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { describe, expect, it } from "vitest";
import { getJson } from "@jwcarman/roux-web/api";
import { takeSignInReturn } from "@jwcarman/roux-web/signin";
import { server, serverError } from "@jwcarman/roux-web/testing";
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

/** Opens the account menu inside `scope` and picks `item`. */
async function fromAccount(scope: HTMLElement, item: string) {
  await userEvent.click(within(scope).getByRole("button", { name: "Account" }));
  await userEvent.click(await within(scope).findByRole("menuitem", { name: item }));
}

describe("the root route", () => {
  it("signs out from the account area and lands on sign-in", async () => {
    server.use(
      http.post("/api/roux/auth/logout", () => new HttpResponse(null, { status: 204 })),
      http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })),
      http.get("/api/roux/auth/me/passkeys", () => HttpResponse.json([])),
    );
    const { router } = renderRoute("/settings", { permissions: [] });
    await screen.findByRole("heading", { name: "Settings" });

    await fromAccount(screen.getByRole("complementary"), "Sign out");

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    // Signing in again starts at Home, not the page they signed out on.
    expect(takeSignInReturn()).toBeUndefined();
  });

  it("remembers nothing as a signed-in caller moves between pages", async () => {
    server.use(http.get("/api/roux/auth/me/passkeys", () => HttpResponse.json([])));
    renderRoute("/settings", { permissions: [] });
    await screen.findByRole("heading", { name: "Settings" });

    expect(takeSignInReturn()).toBeUndefined();
  });

  it("remembers a page a signed-out visitor opens, for after signing in", async () => {
    server.use(http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })));
    const { router } = renderRoute("/settings", { permissions: null });

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
    expect(takeSignInReturn()).toBe("/settings");
  });

  it("signs out from the phone's navigation drawer, closing it", async () => {
    server.use(
      http.post("/api/roux/auth/logout", () => new HttpResponse(null, { status: 204 })),
      http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })),
    );
    const { router } = renderRoute("/", { permissions: [] });
    // The menu button shows only on a phone's width, which jsdom does not have.
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Open navigation",
        hidden: true,
      }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });

    expect(within(drawer).getByRole("button", { name: "Account" })).toHaveTextContent("Test User");
    await fromAccount(drawer, "Sign out");

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
      http.get("/api/roux/users/u-1", () => (failing ? serverError() : HttpResponse.json(GRACE))),
      http.get("/api/roux/users/u-1/activities", () => HttpResponse.json({ data: [], next: null })),
    );
    renderRoute("/users/u-1", { permissions: [USERS_READ] });

    const retry = await screen.findByRole("button", { name: "Try again" });
    failing = false;
    await userEvent.click(retry);

    expect(await screen.findByRole("heading", { name: "Grace Hopper" })).toBeInTheDocument();
  });

  it("sends the caller to sign in when the session ends on the server", async () => {
    server.use(http.get("/api/roux/auth/sign-in", () => HttpResponse.json({ providers: [] })));
    const { router } = renderRoute("/", { permissions: [] });
    await screen.findByRole("heading", { name: /^Welcome/ });
    server.use(
      http.get("/api/roux/auth/me", () => new HttpResponse(null, { status: 401 })),
      http.get("/api/anything", () => new HttpResponse(null, { status: 401 })),
    );

    // Any API call answering 401 says the session is gone.
    await getJson("/api/anything").catch(() => undefined);

    await waitFor(() => expect(router.state.location.pathname).toBe("/signin"));
  });

  it("shows who is signed in on the account button: initials, name and email", async () => {
    renderRoute("/", { permissions: [] });
    const account = within(await screen.findByRole("complementary")).getByRole("button", { name: "Account" });

    await waitFor(() => expect(account).toHaveTextContent("Test User"));
    expect(account).toHaveTextContent("TU");
    expect(account).toHaveTextContent("test@example.org");
  });

  it("keeps the person's settings in the account menu, not the navigation", async () => {
    server.use(http.get("/api/roux/auth/me/passkeys", () => HttpResponse.json([])));
    const { router } = renderRoute("/", { permissions: [] });
    const sidebar = await screen.findByRole("complementary");
    expect(within(sidebar).queryByRole("link", { name: "Settings" })).toBeNull();

    await fromAccount(sidebar, "Settings");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    expect(router.state.location.pathname).toBe("/settings");
  });

  it("closes the phone's drawer on the way to settings", async () => {
    server.use(http.get("/api/roux/auth/me/passkeys", () => HttpResponse.json([])));
    renderRoute("/", { permissions: [] });
    await userEvent.click(
      await screen.findByRole("button", {
        name: "Open navigation",
        hidden: true,
      }),
    );
    const drawer = await screen.findByRole("dialog", { name: "Navigation" });

    await fromAccount(drawer, "Settings");

    expect(await screen.findByRole("heading", { name: "Settings" })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Navigation", hidden: true })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("turns dark mode on and off from the account menu", async () => {
    window.localStorage.clear();
    renderRoute("/", { permissions: [] });
    const sidebar = await screen.findByRole("complementary");
    await userEvent.click(within(sidebar).getByRole("button", { name: "Account" }));
    const dark = await within(sidebar).findByRole("menuitemcheckbox", {
      name: "Dark mode",
    });
    expect(dark).toHaveAttribute("aria-checked", "false");

    await userEvent.click(dark);

    await waitFor(() => expect(document.documentElement).toHaveClass("dark"));
    expect(dark).toHaveAttribute("aria-checked", "true");

    await userEvent.click(dark);

    await waitFor(() => expect(document.documentElement).toHaveClass("light"));
    expect(dark).toHaveAttribute("aria-checked", "false");
  });

  it("puts the app's mark beside its name", async () => {
    renderRoute("/", { permissions: [] });
    const name = within(await screen.findByRole("complementary")).getByRole("heading", { level: 1 });
    expect(name.querySelector("svg rect")).not.toBeNull();
  });
});
