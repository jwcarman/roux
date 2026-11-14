// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { NotFoundPage } from "./NotFoundPage";

describe("NotFoundPage", () => {
  it("says the page was not found and leads home", () => {
    renderWithProviders(<NotFoundPage />);
    expect(screen.getByRole("heading", { name: "Page not found" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Go to the home page" })).toHaveAttribute("href", "/");
  });

  it("names what was not found when told", () => {
    renderWithProviders(<NotFoundPage title="Member not found" />);
    expect(screen.getByRole("heading", { name: "Member not found" })).toBeInTheDocument();
  });
});
