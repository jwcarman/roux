// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi, type MockInstance } from "vitest";
import { pageQuery, type PageDto } from "../paging";
import { renderWithProviders } from "../testing/render";
import type { Activity } from "./Activity";
import { ActivityList } from "./ActivityList";

const RENAMED: Activity = {
  id: "a1",
  occurredAt: "2026-11-05T12:00:00Z",
  type: "member.renamed",
  description: "Renamed from Ada Lovelace to Ada King",
  actorId: "p1",
  actorName: "James",
  details: { from: "Ada Lovelace", to: "Ada King" },
};

function pageOf(data: Activity[]): PageDto<Activity> {
  return {
    data,
    pagination: {
      pageIndex: 0,
      pageSize: 20,
      totalElementCount: data.length,
      totalPageCount: data.length === 0 ? 0 : 1,
      hasNext: false,
      hasPrevious: false,
    },
  };
}

describe("ActivityList", () => {
  // React warns of a missing or repeated key once per component, in whichever test renders it first,
  // so every test here watches for it.
  let errors: MockInstance;
  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => undefined);
  });
  afterEach(() => {
    expect(errors).not.toHaveBeenCalled();
    errors.mockRestore();
  });

  it("shows each entry's description, who did it and when", async () => {
    renderWithProviders(
      <ActivityList
        aria-label="History"
        query={pageQuery(["history"], () => Promise.resolve(pageOf([RENAMED])))}
        now={new Date("2026-11-08T12:00:00Z")}
      />,
    );
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Renamed from Ada Lovelace to Ada King");
    expect(item).toHaveTextContent("by James ·");
    const time = within(item).getByText("3 days ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-05T12:00:00Z");
    expect(time).toHaveAttribute("title", "Nov 5, 2026, 7:00 AM"); // the moment where the organization is
    expect(screen.getByRole("list", { name: "History" })).toBeInTheDocument();
  });

  it("keys each entry by its id, so React keeps them apart", async () => {
    renderWithProviders(
      <ActivityList
        aria-label="History"
        query={pageQuery(["two"], () => Promise.resolve(pageOf([RENAMED, { ...RENAMED, id: "a2" }])))}
      />,
    );
    expect(await screen.findAllByRole("listitem")).toHaveLength(2);
  });

  it("says when there is no history yet", async () => {
    renderWithProviders(
      <ActivityList aria-label="History" query={pageQuery(["empty"], () => Promise.resolve(pageOf([])))} />,
    );
    expect(await screen.findByText("Nothing has happened yet.")).toBeInTheDocument();
  });

  it("says it its own way when asked", async () => {
    renderWithProviders(
      <ActivityList
        aria-label="History"
        query={pageQuery(["empty-own"], () => Promise.resolve(pageOf([])))}
        emptyText="No promotions yet."
      />,
    );
    expect(await screen.findByText("No promotions yet.")).toBeInTheDocument();
  });

  it("says when the history could not be loaded", async () => {
    renderWithProviders(
      <ActivityList aria-label="History" query={pageQuery(["broken"], () => Promise.reject(new Error("down")))} />,
    );
    expect(await screen.findByText("Could not load the history.")).toBeInTheDocument();
  });
});
