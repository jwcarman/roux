// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { ExportButton, exportHref } from "./ExportButton";

describe("exportHref", () => {
  it("carries the search, filters and sort, and no paging", () => {
    expect(
      exportHref("/api/members/export.csv", {
        pageIndex: 2,
        pageSize: 10,
        sortBy: "EMAIL",
        sortDirection: "DESC",
        search: "ada",
        role: "OWNER",
        status: "DEACTIVATED",
      }),
    ).toBe("/api/members/export.csv?sortBy=EMAIL&sortDirection=DESC&search=ada&role=OWNER&status=DEACTIVATED");
  });
});

describe("ExportButton", () => {
  it("is a download link", () => {
    renderWithProviders(<ExportButton href="/api/members/export.csv?role=OWNER" />);
    const link = screen.getByRole("link", { name: "Export" });
    expect(link).toHaveAttribute("href", "/api/members/export.csv?role=OWNER");
    expect(link).toHaveAttribute("download");
  });
});
