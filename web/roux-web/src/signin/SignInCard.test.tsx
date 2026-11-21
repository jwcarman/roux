// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLocationReplace } from "../testing/location";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { SignInCard } from "./SignInCard";

/** The ways of signing in who reports as on. */
function options(email: boolean, passkey: boolean, providers: { id: string; name: string }[] = []) {
  server.use(http.get("/who/sign-in", () => HttpResponse.json({ email, passkey, providers })));
}

/** who emails the link (202), or refuses with `status`; every address asked for is kept. */
function sends(...statuses: number[]) {
  const sent: unknown[] = [];
  server.use(
    http.post("/who/email/send", async ({ request }) => {
      sent.push(await request.json());
      return new HttpResponse(null, { status: statuses[sent.length - 1] ?? 202 });
    }),
  );
  return sent;
}

function card() {
  renderWithProviders(<SignInCard appName="Acme" logo={<span data-testid="logo" />} />);
}

async function askForALink(address = "ada@example.org") {
  await userEvent.type(await screen.findByRole("textbox", { name: "Email" }), address);
  await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));
}

describe("SignInCard", () => {
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

  it("names the app, under its logo", async () => {
    options(true, true);
    card();

    expect(screen.getByRole("heading", { level: 1, name: "Sign in to Acme" })).toBeInTheDocument();
    expect(screen.getByTestId("logo")).toBeInTheDocument();
    await screen.findByRole("textbox", { name: "Email" });
  });

  it("offers an emailed link first, then a passkey", async () => {
    options(true, true);
    card();

    expect(await screen.findByRole("textbox", { name: "Email" })).toHaveAttribute(
      "autocomplete",
      "username webauthn",
    );
    expect(screen.getByText("We'll email you a link to sign in.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeInTheDocument();
    expect(screen.getByRole("separator")).toBeInTheDocument();
    expect(screen.getByText("Have a passkey?")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
    expect(screen.queryByText("Other ways to sign in")).not.toBeInTheDocument();
  });

  it("lists the passkey and each provider who reports under 'Other ways to sign in'", async () => {
    options(true, true, [
      { id: "google", name: "Google" },
      { id: "acme-sso", name: "Acme SSO" },
    ]);
    card();

    expect(await screen.findByText("Other ways to sign in")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toHaveAttribute(
      "href",
      "/who/oidc/authorize/google",
    );
    expect(screen.getByRole("link", { name: "Continue with Acme SSO" })).toBeInTheDocument();
    expect(screen.queryByText("Have a passkey?")).not.toBeInTheDocument();
  });

  it("lists a provider the same way when the passkey is off", async () => {
    options(true, false, [{ id: "google", name: "Google" }]);
    card();

    expect(await screen.findByText("Other ways to sign in")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use a passkey" })).not.toBeInTheDocument();
  });

  it("offers only the email link when nothing else is on", async () => {
    options(true, false);
    card();

    await screen.findByRole("textbox", { name: "Email" });
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use a passkey" })).not.toBeInTheDocument();
    expect(screen.queryByText("Other ways to sign in")).not.toBeInTheDocument();
  });

  it("offers the other ways alone, and plainly, when email is off", async () => {
    options(false, true, [{ id: "google", name: "Google" }]);
    card();

    expect(await screen.findByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Continue with Google" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByText("We'll email you a link to sign in.")).not.toBeInTheDocument();
    expect(screen.queryByRole("separator")).not.toBeInTheDocument();
    expect(screen.queryByText("Other ways to sign in")).not.toBeInTheDocument();
    expect(screen.queryByText("Have a passkey?")).not.toBeInTheDocument();
  });

  it("offers the email link and a passkey when who cannot be asked", async () => {
    server.use(http.get("/who/sign-in", () => new HttpResponse(null, { status: 500 })));
    card();

    expect(await screen.findByRole("textbox", { name: "Email" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
  });

  it("offers nothing to choose until who answers", async () => {
    server.use(
      http.get("/who/sign-in", async () => {
        await delay("infinite");
        return HttpResponse.json({});
      }),
    );
    card();

    await delay(50);
    expect(screen.getByRole("heading", { name: "Sign in to Acme" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("says so on the card when the link could not be sent", async () => {
    options(true, true);
    sends(500);
    card();

    await askForALink();

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the link. Try again.");
    expect(screen.getByRole("heading", { name: "Sign in to Acme" })).toBeInTheDocument();
  });

  it("turns to checking email once the link is sent: the address, and the code beside Sign in", async () => {
    options(true, true, [{ id: "google", name: "Google" }]);
    const sent = sends();
    card();

    await askForALink();

    expect(await screen.findByRole("heading", { level: 1, name: "Check your email" })).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent(
      "We sent a sign-in link to ada@example.org. Open it on this device, or type the code from the email.",
    );
    expect(screen.getByLabelText("Code from the email")).toHaveAttribute("autocomplete", "one-time-code");
    expect(screen.getByRole("button", { name: "Sign in" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { name: "Sign in to Acme" })).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Email" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Use a passkey" })).not.toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Continue with Google" })).not.toBeInTheDocument();
    expect(sent).toEqual([{ email: "ada@example.org" }]);
  });

  it("signs in with the emailed code and goes where the visitor was going", async () => {
    options(true, true);
    sends();
    server.use(http.post("/who/email/sign-in", () => HttpResponse.json({ identityId: "id-1" })));
    card();
    await askForALink();

    await userEvent.type(await screen.findByLabelText("Code from the email"), "K7F-2QM");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/"));
  });

  it("goes back to the address, still filled in, for a different email", async () => {
    options(true, true);
    sends();
    card();
    await askForALink();

    await userEvent.click(await screen.findByRole("button", { name: "Use a different email" }));

    expect(screen.getByRole("heading", { name: "Sign in to Acme" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("ada@example.org");
    expect(screen.getByRole("button", { name: "Use a passkey" })).toBeInTheDocument();
  });

  it("sends the link again to the same address, and says so", async () => {
    options(true, true);
    const sent = sends();
    card();
    await askForALink();

    await userEvent.click(await screen.findByRole("button", { name: "Send it again" }));

    expect(await screen.findByText("We sent another link.")).toBeInTheDocument();
    expect(sent).toEqual([{ email: "ada@example.org" }, { email: "ada@example.org" }]);
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when sending again fails, and clears that when the next try works", async () => {
    options(true, true);
    sends(202, 500, 202);
    card();
    await askForALink();
    const again = await screen.findByRole("button", { name: "Send it again" });

    await userEvent.click(again);

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the link. Try again.");
    expect(screen.queryByText("We sent another link.")).not.toBeInTheDocument();

    await userEvent.click(again);

    expect(await screen.findByText("We sent another link.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("says so when who refuses to send it again (a failed human check)", async () => {
    options(true, true);
    let sends = 0;
    server.use(
      http.post("/who/email/send", () =>
        sends++ === 0
          ? new HttpResponse(null, { status: 202 })
          : new HttpResponse(null, { status: 403, headers: { "Who-Error": "human-check-failed" } }),
      ),
    );
    card();
    await askForALink();

    await userEvent.click(await screen.findByRole("button", { name: "Send it again" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the link. Try again.");
  });

  it("takes back the last answer while the link is sent again", async () => {
    options(true, true);
    let release = () => {};
    let sends = 0;
    server.use(
      http.post("/who/email/send", async () => {
        sends++;
        if (sends === 2) {
          return new HttpResponse(null, { status: 500 });
        }
        if (sends === 3) {
          await new Promise<void>((resolve) => {
            release = resolve;
          });
        }
        return new HttpResponse(null, { status: 202 });
      }),
    );
    card();
    await askForALink();
    const again = await screen.findByRole("button", { name: "Send it again" });
    await userEvent.click(again);
    await screen.findByRole("alert");

    await userEvent.click(again);

    await vi.waitFor(() => expect(sends).toBe(3));
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    release();
    expect(await screen.findByText("We sent another link.")).toBeInTheDocument();
  });

  it("tells a refused passkey on the card", async () => {
    options(true, true);
    server.use(
      http.post("/who/passkey/sign-in/options", () =>
        HttpResponse.json({ challenge: "AAAA", allowCredentials: [] }),
      ),
    );
    vi.stubGlobal("navigator", {
      ...navigator,
      credentials: { get: () => Promise.reject(new DOMException("cancelled", "NotAllowedError")) },
    });
    card();

    await userEvent.click(await screen.findByRole("button", { name: "Use a passkey" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Passkey sign-in was cancelled.");
  });
});
