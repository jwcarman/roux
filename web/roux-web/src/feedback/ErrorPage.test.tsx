// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { ErrorPage } from "./ErrorPage";

describe("ErrorPage", () => {
  it("says something went wrong and offers to try again", async () => {
    const onRetry = vi.fn();
    renderWithProviders(<ErrorPage onRetry={onRetry} />);
    expect(screen.getByRole("heading", { name: "Something went wrong" })).toBeInTheDocument();

    await userEvent.setup().click(screen.getByRole("button", { name: "Try again" }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});
