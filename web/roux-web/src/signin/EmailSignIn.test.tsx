// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { stubLocationReplace } from "../testing/location";
import { renderWithProviders } from "../testing/render";
import { server } from "../testing/server";
import { EmailSignIn } from "./EmailSignIn";
import { rememberSignInReturn } from "./returnTo";

describe("EmailSignIn", () => {
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

  async function askForALink(address = "ada@example.org") {
    const sent: unknown[] = [];
    server.use(
      http.post("/who/email/send", async ({ request }) => {
        sent.push(await request.json());
        return new HttpResponse(null, { status: 202 });
      }),
    );
    renderWithProviders(<EmailSignIn />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), address);
    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));
    return sent;
  }

  it("asks for an address, and nothing else, at first", () => {
    renderWithProviders(<EmailSignIn />);

    expect(screen.getByRole("textbox", { name: "Email" })).toHaveAttribute("autocomplete", "username webauthn");
    expect(screen.getByRole("button", { name: "Email me a link" })).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Code from the email")).not.toBeInTheDocument();
  });

  it("keeps the address field empty at first, and refuses an empty submit in roux's words", async () => {
    renderWithProviders(<EmailSignIn />);
    expect(screen.getByRole("textbox", { name: "Email" })).toHaveValue("");

    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
  });

  it("does not let the code form reload the page", async () => {
    await askForALink();
    server.use(http.post("/who/email/sign-in", () => HttpResponse.json({ identityId: "id-1" })));
    const code = await screen.findByLabelText("Code from the email");

    const proceeded = fireEvent.submit(code.closest("form")!);

    expect(proceeded).toBe(false);
  });

  it("shows no complaint under the code field until a code is refused", async () => {
    await askForALink();

    const code = await screen.findByLabelText("Code from the email");

    expect(code).toBeValid();
    expect(document.querySelector('[data-part="error-text"]')).toBeNull();
    expect(screen.queryByText(/did not work/)).not.toBeInTheDocument();
  });

  it("emails the link, then offers the code", async () => {
    const sent = await askForALink();

    expect(await screen.findByRole("status")).toHaveTextContent("Check your email");
    expect(screen.getByText("Open the link, or type the code from the email.")).toBeInTheDocument();
    expect(screen.getByLabelText("Code from the email")).toHaveAttribute("autocomplete", "one-time-code");
    expect(sent).toEqual([{ email: "ada@example.org" }]);
  });

  it("refuses an address that is not one, in roux's words, without asking who", async () => {
    renderWithProviders(<EmailSignIn />);

    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada");
    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByText("Must be a valid email address")).toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so when the link could not be sent", async () => {
    server.use(http.post("/who/email/send", () => new HttpResponse(null, { status: 500 })));
    renderWithProviders(<EmailSignIn />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.org");

    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the link. Try again.");
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });

  it("says so when who refuses the send (a failed human check)", async () => {
    server.use(
      http.post(
        "/who/email/send",
        () => new HttpResponse(null, { status: 403, headers: { "Who-Error": "human-check-failed" } }),
      ),
    );
    renderWithProviders(<EmailSignIn />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.org");

    await userEvent.click(screen.getByRole("button", { name: "Email me a link" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not send the link. Try again.");
  });

  it("clears that refusal when the next try works", async () => {
    let calls = 0;
    server.use(
      http.post("/who/email/send", () =>
        calls++ === 0 ? new HttpResponse(null, { status: 500 }) : new HttpResponse(null, { status: 202 }),
      ),
    );
    renderWithProviders(<EmailSignIn />);
    await userEvent.type(screen.getByRole("textbox", { name: "Email" }), "ada@example.org");
    const ask = screen.getByRole("button", { name: "Email me a link" });
    await userEvent.click(ask);
    await screen.findByRole("alert");

    await userEvent.click(ask);

    expect(await screen.findByRole("status")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("signs in with the typed code and goes where the visitor was going", async () => {
    rememberSignInReturn("/students");
    await askForALink();
    const bodies: unknown[] = [];
    server.use(
      http.post("/who/email/sign-in", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ identityId: "id-1" });
      }),
    );
    await userEvent.type(await screen.findByLabelText("Code from the email"), "K7F-2QM");

    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/students"));
    expect(bodies).toEqual([{ email: "ada@example.org", code: "K7F-2QM" }]);
  });

  it("signs in with the Enter key in the code field", async () => {
    await askForALink();
    server.use(http.post("/who/email/sign-in", () => HttpResponse.json({ identityId: "id-1" })));

    await userEvent.type(await screen.findByLabelText("Code from the email"), "K7F-2QM{Enter}");

    await vi.waitFor(() => expect(replace).toHaveBeenCalledExactlyOnceWith("/"));
  });

  it("tells a code that could not be checked under the field too", async () => {
    await askForALink();
    server.use(http.post("/who/email/sign-in", () => new HttpResponse(null, { status: 500 })));
    await userEvent.type(await screen.findByLabelText("Code from the email"), "K7F-2QM{Enter}");

    expect(await screen.findByText("That code did not work. Check it, or ask for a new email.")).toBeInTheDocument();
    expect(replace).not.toHaveBeenCalled();
  });

  it("tells a wrong code under the field, and takes another", async () => {
    await askForALink();
    let answers = 0;
    server.use(
      http.post("/who/email/sign-in", () =>
        answers++ === 0 ? new HttpResponse(null, { status: 401 }) : HttpResponse.json({ identityId: "id-1" }),
      ),
    );
    const code = await screen.findByLabelText("Code from the email");
    await userEvent.type(code, "WRONG");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    expect(await screen.findByText("That code did not work. Check it, or ask for a new email.")).toBeInTheDocument();
    expect(code).toBeInvalid();
    expect(replace).not.toHaveBeenCalled();

    await userEvent.clear(code);
    await userEvent.type(code, "K7F-2QM");
    await userEvent.click(screen.getByRole("button", { name: "Sign in" }));

    await vi.waitFor(() => expect(replace).toHaveBeenCalled());
    expect(screen.queryByText(/did not work/)).not.toBeInTheDocument();
  });
});
