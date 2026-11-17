// @vitest-environment jsdom
import { screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { Activity } from "../api";
import { pageQuery } from "@jwcarman/roux-web/paging";
import { renderWithProviders } from "../testing/render";
import { ActivityList } from "./ActivityList";

const ENTRY: Activity = {
  id: "a1",
  occurredAt: "2026-11-05T12:00:00Z",
  action: "member.renamed",
  summary: "Renamed from Ada Lovelace to Ada King",
  actorName: "James",
};

describe("ActivityList", () => {
  it("shows each entry's summary, who did it and when", async () => {
    renderWithProviders(
      <ActivityList
        aria-label="History"
        query={pageQuery(["history"], async () => ({
          data: [ENTRY],
          pagination: {
            pageIndex: 0,
            pageSize: 20,
            totalElementCount: 1,
            totalPageCount: 1,
            hasNext: false,
            hasPrevious: false,
          },
        }))}
        now={new Date("2026-11-08T12:00:00Z")}
      />,
    );
    const item = await screen.findByRole("listitem");
    expect(item).toHaveTextContent("Renamed from Ada Lovelace to Ada King");
    expect(item).toHaveTextContent("James");
    const time = within(item).getByText("3 days ago");
    expect(time.tagName).toBe("TIME");
    expect(time).toHaveAttribute("datetime", "2026-11-05T12:00:00Z");
    expect(time.getAttribute("title")).toBeTruthy();
  });

  it("says when there is no history yet", async () => {
    renderWithProviders(
      <ActivityList
        aria-label="History"
        query={pageQuery(["empty-history"], async () => ({
          data: [],
          pagination: {
            pageIndex: 0,
            pageSize: 20,
            totalElementCount: 0,
            totalPageCount: 0,
            hasNext: false,
            hasPrevious: false,
          },
        }))}
      />,
    );
    expect(await screen.findByText("Nothing has happened yet.")).toBeInTheDocument();
  });
});
