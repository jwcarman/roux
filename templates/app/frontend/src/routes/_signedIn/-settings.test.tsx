// @vitest-environment jsdom
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { listPasskeys, registerPasskey, removePasskey } from "../../users/passkeys";
import { http, HttpResponse } from "msw";
import { server } from "@jwcarman/roux-web/testing";
import { renderRoute } from "../../testing/route";

vi.mock("../../users/passkeys", async (actual) => ({
  ...(await actual<typeof import("../../users/passkeys")>()),
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

async function openSettings() {
  const rendered = renderRoute("/settings", { permissions: [] });
  await screen.findByRole("heading", { level: 2, name: "Settings" });
  return rendered;
}

/**
 * Counts the times the session asks who who is signed in, from `start()` on (the caller is still
 * signed in, so the page stays).
 */
function askedAgain() {
  const asked = {
    count: 0,
    start: () =>
      server.use(
        http.get("/who/me", () => {
          asked.count++;
          return HttpResponse.json({ identityId: "id-1", permissions: [] });
        }),
      ),
  };
  return asked;
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

describe("/settings", () => {
  it("has a section for the profile and one for passkeys, each saying what it is for", async () => {
    await openSettings();
    expect(screen.getByRole("heading", { level: 3, name: "Profile" })).toBeInTheDocument();
    expect(screen.getByText(/^How you appear to others in /)).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 3, name: "Passkeys" })).toBeInTheDocument();
    expect(screen.getByText("Sign in with your fingerprint, face or device PIN.")).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: /Passkey label/ })).toBeNull();
  });

  it("says there are no passkeys yet", async () => {
    await openSettings();
    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "Passkeys" })).toBeNull();
  });

  it("shows neither a list nor its absence until the passkeys have loaded", async () => {
    list.mockReturnValue(new Promise(() => undefined));
    await openSettings();
    expect(screen.queryByText("No passkeys yet.")).toBeNull();
    expect(screen.queryByRole("list", { name: "Passkeys" })).toBeNull();
  });

  it("lists the passkeys with when each was made and last used", async () => {
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    await openSettings();

    const passkeys = await screen.findByRole("list", { name: "Passkeys" });
    const [laptop] = within(passkeys).getAllByRole("listitem");
    expect(within(laptop).getByText("Work laptop")).toBeInTheDocument();
    expect(within(laptop).getByText("Added Jun 1, 2026 · Last used never")).toBeInTheDocument();
    expect(within(laptop).getByRole("button", { name: "Remove Work laptop" })).toBeInTheDocument();
  });

  it("says when the passkeys cannot be loaded", async () => {
    list.mockResolvedValue({ ok: false, reason: "failed" } as never);
    await openSettings();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the passkeys.");
  });

  it("says when loading the passkeys throws", async () => {
    list.mockRejectedValue(new Error("offline"));
    await openSettings();
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not load the passkeys.");
  });

  it("asks the session again, and lists nothing, when listing finds it signed out", async () => {
    const asked = askedAgain();
    list.mockImplementation(async () => {
      asked.start();
      return { ok: false, reason: "signed-out" } as never;
    });
    await openSettings();

    await waitFor(() => expect(asked.count).toBeGreaterThan(0));
    expect(await screen.findByText("No passkeys yet.")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).toBeNull();
  });

  it("adds a passkey under its trimmed label, then closes, lists it, and opens empty next time", async () => {
    register.mockResolvedValue({ ok: true, value: undefined } as never);
    await openSettings();
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

  it.each([
    ["cancelled", "Adding the passkey was cancelled."],
    ["already-registered", "This device already has a passkey for your account."],
    ["failed", "Could not add the passkey. Sign in again and retry."],
  ])("says why a passkey was not added (%s)", async (reason, text) => {
    register.mockResolvedValue({ ok: false, reason } as never);
    await openSettings();

    const dialog = await addPasskey("Phone");

    expect(await screen.findByText(text)).toBeInTheDocument();
    // Still open, to try again.
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("says a passkey was not added when registering throws", async () => {
    register.mockRejectedValue(new Error("no WebAuthn"));
    await openSettings();

    await addPasskey("Phone");

    expect(await screen.findByText("Could not add the passkey. Sign in again and retry.")).toBeInTheDocument();
  });

  it("refuses a blank label without asking the browser", async () => {
    await openSettings();

    await addPasskey("");

    expect(await screen.findByText("Name this passkey, such as the device it is on")).toBeInTheDocument();
    expect(register).not.toHaveBeenCalled();
  });

  it("removes a passkey, then lists what is left", async () => {
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    remove.mockResolvedValue({ ok: true, value: undefined } as never);
    await openSettings();
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
    await openSettings();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Work laptop" }));

    expect(await screen.findByText(text)).toBeInTheDocument();
  });

  it("asks the session again, rather than reporting, when removing finds it signed out", async () => {
    const asked = askedAgain();
    list.mockResolvedValue({ ok: true, value: [LAPTOP] } as never);
    remove.mockImplementation(async () => {
      asked.start();
      return { ok: false, reason: "signed-out" } as never;
    });
    await openSettings();

    await userEvent.click(await screen.findByRole("button", { name: "Remove Work laptop" }));

    await waitFor(() => expect(asked.count).toBeGreaterThan(0));
    expect(screen.queryByRole("status")).toBeNull();
  });
});
