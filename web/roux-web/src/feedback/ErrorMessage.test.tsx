// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { ErrorMessage } from "./ErrorMessage";

describe("ErrorMessage", () => {
  it("announces its text as an alert", () => {
    const { container } = renderWithProviders(<ErrorMessage>Something broke.</ErrorMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Something broke.");
    expect(container.querySelector(".chakra-alert__title")).toBeNull();
  });

  it("shows a title above the text when given one", () => {
    renderWithProviders(<ErrorMessage title="Save failed">Try again.</ErrorMessage>);
    expect(screen.getByRole("alert")).toHaveTextContent("Save failed");
    expect(screen.getByRole("alert")).toHaveTextContent("Try again.");
  });
});
