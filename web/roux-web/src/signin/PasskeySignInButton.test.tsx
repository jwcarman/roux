// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLocationReplace } from "../testing/location";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { PasskeySignInButton } from "./PasskeySignInButton";
import { rememberSignInReturn } from "./returnTo";

const bytes = (...values: number[]) => new Uint8Array(values).buffer;

/** What the browser's authenticator answers: a credential for who to verify. */
const credential = {
  id: "cred-1",
  rawId: bytes(1, 2, 3),
  type: "public-key",
  authenticatorAttachment: "platform",
  response: {
    authenticatorData: bytes(4),
    clientDataJSON: bytes(5),
    signature: bytes(6),
    userHandle: bytes(7),
  },
  getClientExtensionResults: () => ({}),
};

function authenticator(get: () => Promise<unknown>) {
  vi.stubGlobal("navigator", { ...navigator, credentials: { get } });
}

function who(signIn: () => Response) {
  server.use(
    http.post("/who/passkey/sign-in/options", () => HttpResponse.json({ challenge: "AAAA", allowCredentials: [] })),
    http.post("/who/passkey/sign-in", () => signIn()),
  );
}

describe("PasskeySignInButton", () => {
  let replace: ReturnType<typeof stubLocationReplace>;

  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    localStorage.clear();
    replace = stubLocationReplace();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    localStorage.clear();
  });

  it("signs in with the passkey and goes where the visitor was going", async () => {
    rememberSignInReturn("/students");
    authenticator(() => Promise.resolve(credential));
    who(() => HttpResponse.json({ identityId: "id-1" }));
    renderWithProviders(<PasskeySignInButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/students"));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("goes Home when nothing was remembered", async () => {
    authenticator(() => Promise.resolve(credential));
    who(() => HttpResponse.json({ identityId: "id-1" }));
    renderWithProviders(<PasskeySignInButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/"));
  });

  it("says so when the passkey is refused", async () => {
    authenticator(() => Promise.resolve(credential));
    who(() => new HttpResponse(null, { status: 401 }));
    renderWithProviders(<PasskeySignInButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in failed.");
    expect(replace).not.toHaveBeenCalled();
  });

  it("says so when the visitor cancels", async () => {
    authenticator(() => Promise.reject(new DOMException("cancelled", "NotAllowedError")));
    who(() => HttpResponse.json({ identityId: "id-1" }));
    renderWithProviders(<PasskeySignInButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in was cancelled.");
  });

  it("says it failed when the call itself breaks", async () => {
    server.use(http.post("/who/passkey/sign-in/options", () => HttpResponse.error()));
    renderWithProviders(<PasskeySignInButton />);

    await userEvent.click(screen.getByRole("button", { name: "Sign in with a passkey" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in failed.");
  });

  it("clears the last refusal when it tries again", async () => {
    authenticator(() => Promise.resolve(credential));
    let answers = 0;
    who(() => (answers++ === 0 ? new HttpResponse(null, { status: 401 }) : HttpResponse.json({ identityId: "id-1" })));
    renderWithProviders(<PasskeySignInButton />);
    const button = screen.getByRole("button", { name: "Sign in with a passkey" });
    await userEvent.click(button);
    await screen.findByRole("alert");

    await userEvent.click(button);

    await vi.waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("takes the button's own props", () => {
    renderWithProviders(<PasskeySignInButton size="lg" />);

    expect(screen.getByRole("button", { name: "Sign in with a passkey" })).toBeInTheDocument();
  });
});
