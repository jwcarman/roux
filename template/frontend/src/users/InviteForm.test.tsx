// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "@jwcarman/roux-web/feedback";
import { userKeys } from "@jwcarman/roux-web/users";
import {
  invalidFields,
  renderWithProviders,
  server,
  serverError,
} from "@jwcarman/roux-web/testing";
import { InviteForm } from "./InviteForm";

/** Answers the invitation with `response`, and counts how many invitations were sent. */
function answer(response: () => Response) {
  const sent = { count: 0 };
  server.use(
    http.post("/api/roux/users/invitations", () => {
      sent.count++;
      return response();
    }),
  );
  return sent;
}

/** The roles the server says an invitation may give, in its order. */
function invitable(roles: string[]) {
  server.use(
    http.get("/api/roux/roles/invitable", () => HttpResponse.json(roles)),
  );
}

/** A list of users on the page: the invitation refreshes it. `load` answers each fetch. */
function UserList({ load }: { load: () => Promise<string> }) {
  const list = useQuery({ queryKey: userKeys.list({}), queryFn: load });
  return <p>{list.data}</p>;
}

async function openInvite(load: () => Promise<string> = async () => "loaded") {
  const { client } = renderWithProviders(
    <>
      <InviteForm />
      <UserList load={load} />
      <Toaster />
    </>,
  );
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  // the button waits for the server's roles
  await waitFor(() =>
    expect(screen.getByRole("button", { name: "Invite user" })).toBeEnabled(),
  );
  await user.click(screen.getByRole("button", { name: "Invite user" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite a user" });
  return { invalidate, user, dialog };
}

async function invite(
  name: string,
  email: string,
  load?: () => Promise<string>,
) {
  const opened = await openInvite(load);
  await opened.user.type(screen.getByLabelText(/^Name/), name);
  await opened.user.type(screen.getByLabelText(/^Email/), email);
  await opened.user.click(
    screen.getByRole("button", { name: "Send invitation" }),
  );
  return opened;
}

describe("InviteForm", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    invitable(["USER", "ADMIN"]);
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("invites from a dialog, toasts, closes and refreshes the list", async () => {
    answer(() => HttpResponse.json({ linkSent: true }, { status: 202 }));
    const { invalidate, dialog } = await invite(
      "Ada Lovelace",
      "ada@example.com",
    );

    expect(await screen.findByRole("status")).toHaveTextContent(
      "Invitation sent",
    );
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: userKeys.lists(),
    });
  });

  it("invites as a user unless another role is chosen", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/roux/users/invitations", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ linkSent: true }, { status: 202 });
      }),
    );
    const { user } = await openInvite();
    const role = screen.getByLabelText(/^Role/);
    expect(role).toHaveValue("USER");
    expect(
      within(role)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["User", "Admin"]);

    await user.type(screen.getByLabelText(/^Name/), "Ivy");
    await user.type(screen.getByLabelText(/^Email/), "ivy@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      name: "Ivy",
      email: "ivy@example.com",
      role: "USER",
    });
  });

  it("offers only the roles the server lists, the first chosen", async () => {
    invitable(["ADMIN"]);
    await openInvite();

    const role = screen.getByLabelText(/^Role/);
    expect(role).toHaveValue("ADMIN");
    expect(
      within(role)
        .getAllByRole("option")
        .map((option) => option.textContent),
    ).toEqual(["Admin"]);
  });

  it("names a role it has no label for as the server does", async () => {
    invitable(["USER", "COACH"]);
    await openInvite();

    expect(
      within(screen.getByLabelText(/^Role/))
        .getAllByRole("option")
        .map((option) => option.getAttribute("value")),
    ).toEqual(["USER", "COACH"]);
  });

  it("cannot be opened until the server has said which roles may be invited", async () => {
    server.use(
      http.get(
        "/api/roux/roles/invitable",
        () => new Promise<Response>(() => undefined),
      ),
    );
    renderWithProviders(<InviteForm />);

    expect(screen.getByRole("button", { name: "Invite user" })).toBeDisabled();
  });

  it("cannot be opened when no role may be invited", async () => {
    invitable([]);
    renderWithProviders(<InviteForm />);

    await waitFor(() =>
      expect(
        screen.getByRole("button", { name: "Invite user" }),
      ).toBeDisabled(),
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites an instructor when Instructor is chosen", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/roux/users/invitations", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ linkSent: true }, { status: 202 });
      }),
    );
    const { user } = await openInvite();

    await user.type(screen.getByLabelText(/^Name/), "Ivy");
    await user.type(screen.getByLabelText(/^Email/), "ivy@example.com");
    await user.selectOptions(screen.getByLabelText(/^Role/), "ADMIN");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({
      name: "Ivy",
      email: "ivy@example.com",
      role: "ADMIN",
    });
  });

  it("stays open until the list has refreshed, so a quick second invitation can be sent", async () => {
    answer(() => HttpResponse.json({ linkSent: true }, { status: 202 }));
    let refreshed: (names: string) => void = () => undefined;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("before")
      .mockImplementation(
        () => new Promise<string>((resolve) => (refreshed = resolve)),
      );
    const { dialog } = await invite("Ada Lovelace", "ada@example.com", load);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    // the save is not over until the list has refreshed: closing now would reopen a dialog whose
    // Send button is still disabled by the first submission
    expect(dialog).toHaveAttribute("data-state", "open");
    act(() => refreshed("after"));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(screen.getByText("after")).toBeInTheDocument();
  });

  it("says when the user was added but the email could not be sent", async () => {
    answer(() => HttpResponse.json({ linkSent: false }, { status: 202 }));
    const { invalidate } = await invite("Ada Lovelace", "ada@example.com");

    // The toaster also keeps an empty live region with role="alert": find the toast by its text.
    const title = await screen.findByText(
      "Ada Lovelace was added, but the invitation email could not be sent.",
    );
    const toast = title.closest("[role=alert]");
    expect(toast).not.toBeNull();
    expect(toast).toHaveTextContent(
      "Ask them to sign in from the sign-in page with ada@example.com.",
    );
    expect(invalidate).toHaveBeenCalledWith({
      queryKey: userKeys.lists(),
    });
  });

  it("keeps the dialog open with the error under Email when the address is already a user", async () => {
    answer(() => invalidFields({ email: "That address is already a user" }));
    const { dialog } = await invite("Ada Lovelace", "ada@example.com");

    expect(
      await screen.findByText("That address is already a user"),
    ).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute(
      "aria-invalid",
      "true",
    );
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("checks the name and address, in the server's words, before sending anything", async () => {
    const sent = answer(() =>
      HttpResponse.json({ linkSent: true }, { status: 202 }),
    );
    const { user } = await openInvite();
    await user.type(screen.getByLabelText(/^Email/), "not-an-address");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(
      screen.getByText("Must be a valid email address"),
    ).toBeInTheDocument();
    expect(sent.count).toBe(0);
  });

  it("says the invitation could not be sent when the server fails", async () => {
    answer(() => serverError());
    await invite("Ada Lovelace", "ada@example.com");
    expect(
      await screen.findByText("Could not send the invitation"),
    ).toBeInTheDocument();
  });
});
