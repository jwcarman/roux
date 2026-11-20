// @vitest-environment jsdom
import { useQuery } from "@tanstack/react-query";
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { Toaster, toaster } from "@jwcarman/roux-web/feedback";
import { queryKeys } from "../queryKeys";
import { invalidFields, renderWithProviders, server } from "@jwcarman/roux-web/testing";
import { InviteForm } from "./InviteForm";

/** Answers the invitation with `response`, and counts how many invitations were sent. */
function answer(response: () => Response) {
  const sent = { count: 0 };
  server.use(
    http.post("/api/members/invitations", () => {
      sent.count++;
      return response();
    }),
  );
  return sent;
}

/** The roles the server says an invitation may give, in its order. */
function invitable(roles: string[]) {
  server.use(http.get("/api/roles/invitable", () => HttpResponse.json(roles)));
}

/** A list of members on the page: the invitation refreshes it. `load` answers each fetch. */
function MemberList({ load }: { load: () => Promise<string> }) {
  const list = useQuery({ queryKey: queryKeys.members.list({}), queryFn: load });
  return <p>{list.data}</p>;
}

async function openInvite(load: () => Promise<string> = async () => "loaded") {
  const { client } = renderWithProviders(
    <>
      <InviteForm />
      <MemberList load={load} />
      <Toaster />
    </>,
  );
  const invalidate = vi.spyOn(client, "invalidateQueries");
  const user = userEvent.setup();
  // the button waits for the server's roles
  await waitFor(() => expect(screen.getByRole("button", { name: "Invite member" })).toBeEnabled());
  await user.click(screen.getByRole("button", { name: "Invite member" }));
  const dialog = await screen.findByRole("dialog", { name: "Invite a member" });
  return { invalidate, user, dialog };
}

async function invite(name: string, email: string, load?: () => Promise<string>) {
  const opened = await openInvite(load);
  await opened.user.type(screen.getByLabelText(/^Name/), name);
  await opened.user.type(screen.getByLabelText(/^Email/), email);
  await opened.user.click(screen.getByRole("button", { name: "Send invitation" }));
  return opened;
}

describe("InviteForm", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
    invitable(["MEMBER", "INSTRUCTOR"]);
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("invites from a dialog, toasts, closes and refreshes the list", async () => {
    answer(() => HttpResponse.json({ linkSent: true }, { status: 202 }));
    const { invalidate, dialog } = await invite("Ada Lovelace", "ada@example.com");

    expect(await screen.findByRole("status")).toHaveTextContent("Invitation sent");
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.lists() });
  });

  it("invites as a member unless another role is chosen", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/members/invitations", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ linkSent: true }, { status: 202 });
      }),
    );
    const { user } = await openInvite();
    const role = screen.getByLabelText(/^Role/);
    expect(role).toHaveValue("MEMBER");
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Member", "Instructor"]);

    await user.type(screen.getByLabelText(/^Name/), "Ivy");
    await user.type(screen.getByLabelText(/^Email/), "ivy@example.com");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));
    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ name: "Ivy", email: "ivy@example.com", role: "MEMBER" });
  });

  it("offers only the roles the server lists, the first chosen", async () => {
    invitable(["INSTRUCTOR"]);
    await openInvite();

    const role = screen.getByLabelText(/^Role/);
    expect(role).toHaveValue("INSTRUCTOR");
    expect(within(role).getAllByRole("option").map((option) => option.textContent)).toEqual(["Instructor"]);
  });

  it("names a role it has no label for as the server does", async () => {
    invitable(["MEMBER", "COACH"]);
    await openInvite();

    expect(within(screen.getByLabelText(/^Role/)).getAllByRole("option").map((option) => option.getAttribute("value"))).toEqual([
      "MEMBER",
      "COACH",
    ]);
  });

  it("cannot be opened until the server has said which roles may be invited", async () => {
    server.use(http.get("/api/roles/invitable", () => new Promise<Response>(() => undefined)));
    renderWithProviders(<InviteForm />);

    expect(screen.getByRole("button", { name: "Invite member" })).toBeDisabled();
  });

  it("cannot be opened when no role may be invited", async () => {
    invitable([]);
    renderWithProviders(<InviteForm />);

    await waitFor(() => expect(screen.getByRole("button", { name: "Invite member" })).toBeDisabled());
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("invites an instructor when Instructor is chosen", async () => {
    const bodies: unknown[] = [];
    server.use(
      http.post("/api/members/invitations", async ({ request }) => {
        bodies.push(await request.json());
        return HttpResponse.json({ linkSent: true }, { status: 202 });
      }),
    );
    const { user } = await openInvite();

    await user.type(screen.getByLabelText(/^Name/), "Ivy");
    await user.type(screen.getByLabelText(/^Email/), "ivy@example.com");
    await user.selectOptions(screen.getByLabelText(/^Role/), "INSTRUCTOR");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    await waitFor(() => expect(bodies).toHaveLength(1));
    expect(bodies[0]).toEqual({ name: "Ivy", email: "ivy@example.com", role: "INSTRUCTOR" });
  });

  it("stays open until the list has refreshed, so a quick second invitation can be sent", async () => {
    answer(() => HttpResponse.json({ linkSent: true }, { status: 202 }));
    let refreshed: (names: string) => void = () => undefined;
    const load = vi
      .fn<() => Promise<string>>()
      .mockResolvedValueOnce("before")
      .mockImplementation(() => new Promise<string>((resolve) => (refreshed = resolve)));
    const { dialog } = await invite("Ada Lovelace", "ada@example.com", load);
    await waitFor(() => expect(load).toHaveBeenCalledTimes(2));

    // the save is not over until the list has refreshed: closing now would reopen a dialog whose
    // Send button is still disabled by the first submission
    expect(dialog).toHaveAttribute("data-state", "open");
    act(() => refreshed("after"));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
    expect(screen.getByText("after")).toBeInTheDocument();
  });

  it("says when the member was added but the email could not be sent", async () => {
    answer(() => HttpResponse.json({ linkSent: false }, { status: 202 }));
    const { invalidate } = await invite("Ada Lovelace", "ada@example.com");

    // The toaster also keeps an empty live region with role="alert": find the toast by its text.
    const title = await screen.findByText("Ada Lovelace was added, but the invitation email could not be sent.");
    const toast = title.closest("[role=alert]");
    expect(toast).not.toBeNull();
    expect(toast).toHaveTextContent("Ask them to sign in from the sign-in page with ada@example.com.");
    expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.lists() });
  });

  it("keeps the dialog open with the error under Email when the address is already a member", async () => {
    answer(() => invalidFields({ email: "That address is already a member" }));
    const { dialog } = await invite("Ada Lovelace", "ada@example.com");

    expect(await screen.findByText("That address is already a member")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Email/)).toHaveAttribute("aria-invalid", "true");
    expect(dialog).toHaveAttribute("data-state", "open");
  });

  it("checks the name and address, in the server's words, before sending anything", async () => {
    const sent = answer(() => HttpResponse.json({ linkSent: true }, { status: 202 }));
    const { user } = await openInvite();
    await user.type(screen.getByLabelText(/^Email/), "not-an-address");
    await user.click(screen.getByRole("button", { name: "Send invitation" }));

    expect(await screen.findByText("Must not be blank")).toBeInTheDocument();
    expect(screen.getByText("Must be a valid email address")).toBeInTheDocument();
    expect(sent.count).toBe(0);
  });
});
