// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "../feedback";
import { renderWithProviders } from "../testing/render";
import { listPasskeys, registerPasskey, removePasskey } from "./passkeys";
import { PasskeySettings } from "./PasskeySettings";

vi.mock("./passkeys", async (actual) => ({
  ...(await actual<typeof import("./passkeys")>()),
  listPasskeys: vi.fn(),
  registerPasskey: vi.fn(),
  removePasskey: vi.fn(),
}));

const LAPTOP = {
  credentialId: "c-1",
  label: "Work laptop",
  createdAt: "2026-06-01T12:00:00Z",
  lastUsedAt: null,
};

const list = vi.mocked(listPasskeys);
const register = vi.mocked(registerPasskey);
const remove = vi.mocked(removePasskey);

beforeEach(() => {
  list.mockReset().mockResolvedValue({ ok: true, value: [] } as never);
  register.mockReset();
  remove.mockReset();
});

afterEach(() => {
  act(() => toaster.remove());
});

function show() {
  const onSignedOut = vi.fn(() => Promise.resolve());
  renderWithProviders(
    <>
      <PasskeySettings onSignedOut={onSignedOut} />
      <Toaster />
    </>,
  );
  return { onSignedOut };
}

/** Opens "Add a passkey", the button under the list, and answers with `label`. */
async function addPasskey(label: string) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Add a passkey" }));
  const dialog = await screen.findByRole("dialog", { name: "Add a passkey" });
  if (label !== "") {
    await user.type(within(dialog).getByRole("textbox", { name: /Passkey label/ }), label);
  }
  await user.click(within(dialog).getByRole("button", { name: "Add" }));
  return dialog;
}

describe("PasskeySettings", () => {
  it("says there are no passkeys yet, and offers to add one without a form open", async () => {
    show();
    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Passkeys" })).toBeNull();
    expect(screen.getByRole("button", { name: "Add a passkey" })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Passkey label/ })).toBeNull();
  });

  it("shows neither a list nor its absence until the passkeys have loaded", async () => {
    list.mockReturnValue(new Promise(() => undefined));
    show();
    await screen.findByRole("button", { name: "Add a passkey" });
    expect(screen.queryByText("No passkeys yet.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Passkeys" })).toBeNull();
  });

  it("lists the passkeys with when each was made and last used", async () => {
    list.mockResolvedValue({
      ok: true,
      value: [LAPTOP, { ...LAPTOP, credentialId: "c-2", label: "Phone", lastUsedAt: "2026-07-04T12:00:00Z" }],
    } as never);
    show();

    const passkeys = await screen.findByRole("list", { name: "Passkeys" });
    const [laptop, phone] = within(passkeys).getAllByRole("listitem");
    expect(within(laptop).getByText("Work laptop")).toBeInTheDocument();
    expect(within(laptop).getByText("Added Jun 1, 2026 · Last used never")).toBeInTheDocument();
    expect(within(laptop).getByRole("button", { name: "Remove Work laptop" })).toBeInTheDocument();
    expect(within(phone).getByText("Added Jun 1, 2026 · Last used Jul 4, 2026")).toBeInTheDocument();
  });

  it("says when the passkeys cannot be loaded", async () => {
    list.mockResolvedValue({ ok: false, reason: "failed" } as never);
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the passkeys.");
  });

  it("says when loading the passkeys throws", async () => {
    list.mockRejectedValue(new Error("offline"));
    show();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the passkeys.");
  });

  it("tells the app the session ended, and lists nothing, when listing finds it signed out", async () => {
    list.mockResolvedValue({ ok: false, reason: "signed-out" } as never);
    const { onSignedOut } = show();

    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
    expect(onSignedOut).toHaveBeenCalledOnce();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("adds a passkey under its trimmed label, then closes, lists it, and opens empty next time", async () => {
    register.mockResolvedValue({ ok: true, value: undefined } as never);
    show();
    await screen.findByText("No passkeys yet.");
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);

    const dialog = await addPasskey("  Work laptop  ");

    expect(await screen.findByText("Passkey added")).toBeInTheDocument();
    expect(register).toHaveBeenCalledWith("Work laptop");
    // Closed (jsdom keeps a closed dialog mounted, as no animation ends).
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(await screen.findByRole("list", { name: "Passkeys" })).toBeInTheDocument();

    await userEvent.click(screen.getByRole("button", { name: "Add a passkey" }));
    const again = await screen.findByRole("dialog", { name: "Add a passkey" });
    expect(within(again).getByRole("textbox", { name: /Passkey label/ })).toHaveValue("");
  });

  it("offers a label of at most the server's length, with an example", async () => {
    show();
    await userEvent.click(await screen.findByRole("button", { name: "Add a passkey" }));
    const label = within(await screen.findByRole("dialog", { name: "Add a passkey" })).getByRole("textbox", {
      name: /Passkey label/,
    });
    expect(label).toHaveAttribute("maxlength", "64");
    expect(label).toHaveAttribute("placeholder", "Work laptop");
  });

  it.each([
    ["cancelled", "Adding the passkey was cancelled."],
    ["already-registered", "This device already has a passkey for your account."],
    ["failed", "Could not add the passkey. Sign in again and retry."],
  ])("says why a passkey was not added (%s)", async (reason, text) => {
    register.mockResolvedValue({ ok: false, reason } as never);
    show();
    await screen.findByText("No passkeys yet.");

    const dialog = await addPasskey("Phone");

    expect(await screen.findByText(text)).toBeInTheDocument();
    // Still open, to try again.
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("says a passkey was not added when registering throws", async () => {
    register.mockRejectedValue(new Error("no WebAuthn"));
    show();
    await screen.findByText("No passkeys yet.");

    await addPasskey("Phone");

    expect(await screen.findByText("Could not add the passkey. Sign in again and retry.")).toBeInTheDocument();
  });

  it("refuses a blank label without asking the browser", async () => {
    show();
    await screen.findByText("No passkeys yet.");

    await addPasskey("");

    expect(await screen.findByText("Name this passkey, such as the device it is on")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("refuses a bad label as soon as the field is left", async () => {
    show();
    const user = userEvent.setup();
    await user.click(await screen.findByRole("button", { name: "Add a passkey" }));
    const dialog = await screen.findByRole("dialog", { name: "Add a passkey" });
    await user.type(within(dialog).getByRole("textbox", { name: /Passkey label/ }), "   ");

    await user.tab();

    expect(await within(dialog).findByText("Name this passkey, such as the device it is on")).toBeInTheDocument();
  });

  it("removes a passkey, then lists what is left", async () => {
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    remove.mockResolvedValue({ ok: true, value: undefined } as never);
    show();
    const button = await screen.findByRole("button", { name: "Remove Work laptop" });
    list.mockResolvedValue({ ok: true, value: [] } as never);

    await userEvent.click(button);

    expect(await screen.findByText("Passkey removed")).toBeInTheDocument();
    expect(remove).toHaveBeenCalledWith("c-1");
    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
  });

  it.each([
    ["last-credential", "That is your only way to sign in, so it stays."],
    ["failed", "Could not remove the passkey."],
  ])("says why a passkey was not removed (%s)", async (reason, text) => {
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    remove.mockResolvedValue({ ok: false, reason } as never);
    show();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Work laptop" }));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("tells the app the session ended, rather than reporting, when removing finds it signed out", async () => {
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    remove.mockResolvedValue({ ok: false, reason: "signed-out" } as never);
    const { onSignedOut } = show();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Work laptop" }));

    await waitFor(() => expect(onSignedOut).toHaveBeenCalledOnce());
    expect(screen.queryByText(/Could not remove/)).toBeNull();
    expect(screen.queryByText("Passkey removed")).toBeNull();
  });
});
