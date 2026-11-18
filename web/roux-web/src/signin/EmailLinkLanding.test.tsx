// @vitest-environment jsdom
import { ChakraProvider, defaultSystem } from "@chakra-ui/react";
import { QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import { StrictMode } from "react";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLocationReplace } from "../testing/location";
import { renderWithProviders, testQueryClient } from "../testing/render";
import { server } from "../testing/server";
import { EmailLinkLanding } from "./EmailLinkLanding";
import { rememberSignInReturn } from "./returnTo";

describe("EmailLinkLanding", () => {
  let replace: ReturnType<typeof stubLocationReplace>;

  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    localStorage.clear();
    window.history.replaceState({}, "", "/signin/link#token=abc");
    replace = stubLocationReplace();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
    window.history.replaceState({}, "", "/");
  });

  it("signs in with the link's token once, and goes where the visitor was going", async () => {
    rememberSignInReturn("/students");
    let posted = 0;
    server.use(
      http.post("/who/email/sign-in", async ({ request }) => {
        posted++;
        expect(await request.json()).toEqual({ token: "abc" });
        return HttpResponse.json({ identityId: "id-1" });
      }),
    );
    renderWithProviders(<EmailLinkLanding />);

    expect(screen.getByText("One moment...")).toBeInTheDocument();
    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/students"));
    expect(posted).toBe(1);
  });

  it("redeems the link once even when React runs the effect twice", async () => {
    let posted = 0;
    server.use(
      http.post("/who/email/sign-in", () => {
        posted++;
        return HttpResponse.json({ identityId: "id-1" });
      }),
    );
    render(
      <StrictMode>
        <QueryClientProvider client={testQueryClient()}>
          <ChakraProvider value={defaultSystem}>
            <EmailLinkLanding />
          </ChakraProvider>
        </QueryClientProvider>
      </StrictMode>,
    );

    await vi.waitFor(() => expect(replace).toHaveBeenCalled());
    expect(posted).toBe(1);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says the link is no good, and where to get another", async () => {
    server.use(http.post("/who/email/sign-in", () => new HttpResponse(null, { status: 401 })));
    renderWithProviders(<EmailLinkLanding />);

    expect(await screen.findByRole("alert")).toHaveTextContent(
      "This link is invalid or has expired. Request a new one.",
    );
    expect(screen.getByRole("link", { name: "Request a new one" })).toHaveAttribute("href", "/signin");
    expect(replace).not.toHaveBeenCalled();
  });

  it("sends the visitor back to the sign-in page the app names", async () => {
    server.use(http.post("/who/email/sign-in", () => new HttpResponse(null, { status: 401 })));
    renderWithProviders(<EmailLinkLanding signInPath="/login" />);

    expect(await screen.findByRole("link", { name: "Request a new one" })).toHaveAttribute("href", "/login");
  });

  it("says it could not sign in, and where to try again, when who cannot be reached", async () => {
    server.use(http.post("/who/email/sign-in", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<EmailLinkLanding signInPath="/login" />);

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not sign you in. Try the link again, or request a new one.");
    expect(screen.getByRole("link", { name: "request a new one" })).toHaveAttribute("href", "/login");
    expect(replace).not.toHaveBeenCalled();
  });

  it("asks who once, under a key of roux's own", async () => {
    server.use(http.post("/who/email/sign-in", () => HttpResponse.json({ identityId: "id-1" })));
    const { client } = renderWithProviders(<EmailLinkLanding />);

    await vi.waitFor(() => expect(replace).toHaveBeenCalled());

    expect(client.getQueryCache().find({ queryKey: ["roux", "emailLink"] })).toBeDefined();
    expect(client.getQueryCache().getAll()).toHaveLength(1);
  });

  it("is told so when the address holds no token", async () => {
    window.history.replaceState({}, "", "/signin/link");
    renderWithProviders(<EmailLinkLanding />);

    expect(await screen.findByRole("alert")).toHaveTextContent("This link is invalid or has expired.");
    expect(replace).not.toHaveBeenCalled();
  });
});
