// @vitest-environment jsdom
import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MemberDetail } from "../api";
import { ConfirmProvider, Toaster, toaster } from "@jwcarman/roux-web/feedback";
import { queryKeys } from "../queryKeys";
import { invariantViolation, pageOf, renderWithProviders, server } from "@jwcarman/roux-web/testing";
import { MemberDetailView } from "./MemberDetailView";

const GRACE: MemberDetail = {
  id: "g1",
  displayName: "Grace Hopper",
  email: "grace@example.org",
  role: "MEMBER",
  status: "ACTIVE",
  joinedAt: "2026-11-01T09:00:00Z",
};

/** An empty history, and `response` to a status change; returns the status changes asked for. */
function answer(response: () => Response) {
  const changes: string[] = [];
  server.use(
    http.get("/api/users/:id/activities", () => HttpResponse.json(pageOf([], {}))),
    http.post("/api/users/:id/:action", ({ params }) => {
      changes.push(String(params.action));
      return response();
    }),
  );
  return changes;
}

function show(member: MemberDetail, canManage: boolean, isSelf = false) {
  const view = renderWithProviders(
    <ConfirmProvider>
      <MemberDetailView member={member} canManage={canManage} isSelf={isSelf} />
      <Toaster />
    </ConfirmProvider>,
  );
  const invalidate = vi.spyOn(view.client, "invalidateQueries");
  return { invalidate, user: userEvent.setup() };
}

describe("MemberDetailView", () => {
  beforeEach(() => {
    document.cookie = "XSRF-TOKEN=token";
  });

  afterEach(() => {
    act(() => toaster.remove());
  });

  it("shows when the member joined where the school is", () => {
    answer(() => HttpResponse.json(GRACE));
    // 03:00 UTC on Nov 21 is still the evening of Nov 20 in New York, the test school's zone.
    show({ ...GRACE, joinedAt: "2026-11-21T03:00:00Z" }, false);
    expect(screen.getByText("Nov 20, 2026, 10:00 PM")).toBeInTheDocument();
  });

  it("shows an instructor's role by name", () => {
    answer(() => HttpResponse.json(GRACE));
    show({ ...GRACE, role: "INSTRUCTOR" }, false);
    expect(screen.getByText("Instructor")).toBeInTheDocument();
  });

  it("shows the member", () => {
    answer(() => HttpResponse.json(GRACE));
    show(GRACE, false);
    expect(screen.getByRole("heading", { name: "Grace Hopper" })).toBeInTheDocument();
    expect(screen.getByText("grace@example.org")).toBeInTheDocument();
    expect(screen.getByText("Member")).toBeInTheDocument();
    expect(screen.getByText("Active")).toBeInTheDocument();
  });

  it("offers Deactivate only to someone who manages members, and not on their own page", () => {
    answer(() => HttpResponse.json(GRACE));
    show(GRACE, false);
    expect(screen.queryByRole("button", { name: "Deactivate" })).toBeNull();
  });

  it("asks before deactivating, then toasts and refreshes the member, the lists and the history", async () => {
    answer(() => HttpResponse.json({ ...GRACE, status: "DEACTIVATED" }));
    const { invalidate, user } = show(GRACE, true);

    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Grace Hopper?" });
    expect(dialog).toHaveTextContent("They won't be able to sign in.");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));

    expect(await screen.findByText("Grace Hopper was deactivated")).toBeInTheDocument();
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.detail("g1") });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.lists() });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: queryKeys.members.activities("g1") });
    });
  });

  it("deactivates nothing when the question is cancelled", async () => {
    const changes = answer(() => HttpResponse.json(GRACE));
    const { user } = show(GRACE, true);
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await user.click(await screen.findByRole("button", { name: "Cancel" }));
    expect(changes).toEqual([]);
  });

  it("reactivates a deactivated member without asking", async () => {
    answer(() => HttpResponse.json({ ...GRACE, status: "ACTIVE" }));
    const { user } = show({ ...GRACE, status: "DEACTIVATED" }, true);
    expect(screen.getByText("Deactivated")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reactivate" }));
    expect(await screen.findByText("Grace Hopper was reactivated")).toBeInTheDocument();
  });

  it("shows the server's reason when it refuses", async () => {
    answer(() => invariantViolation("The team needs at least one active owner"));
    const { user } = show(GRACE, true);
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    const dialog = await screen.findByRole("alertdialog");
    await user.click(within(dialog).getByRole("button", { name: "Deactivate" }));
    expect(await screen.findByText("The team needs at least one active owner")).toBeInTheDocument();
  });
});
