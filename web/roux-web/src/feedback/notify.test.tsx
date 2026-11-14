// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { notify } from "./notify";
import { Toaster, toaster } from "./toaster";

describe("notify", () => {
  afterEach(() => {
    act(() => toaster.remove());
  });

  it("announces a success politely", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.success("Invitation sent"));
    expect(await screen.findByRole("status")).toHaveTextContent("Invitation sent");
  });

  it("offers the action a success carries", async () => {
    const onClick = vi.fn();
    renderWithProviders(<Toaster />);
    act(() => notify.success("Skill archived", { label: "Undo", onClick }));
    const undo = await screen.findByRole("button", { name: "Undo" });
    act(() => undo.click());
    expect(onClick).toHaveBeenCalledOnce();
  });

  it("announces a failure at once, with its detail", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.error("Couldn't save", "The server did not answer."));
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Couldn't save");
    expect(alert).toHaveTextContent("The server did not answer.");
  });

  it("announces a problem's detail", async () => {
    renderWithProviders(<Toaster />);
    act(() =>
      notify.problem(
        { type: "about:blank", title: "Conflict", status: 409, detail: "Already deactivated" },
        "Could not deactivate",
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Already deactivated");
  });

  it("falls back when the problem has no detail", async () => {
    renderWithProviders(<Toaster />);
    act(() => notify.problem({ type: "about:blank", title: "Bad Gateway", status: 502 }, "Could not save the profile"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the profile");
    expect(document.querySelector("[data-part=description]")).toBeNull();
  });

  it("adds the reference on a server error", async () => {
    renderWithProviders(<Toaster />);
    act(() =>
      notify.problem(
        {
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          detail: "Something went wrong",
          errorId: "7f3a",
        },
        "Could not save",
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Something went wrong");
    expect(alert).toHaveTextContent("Reference: 7f3a");
  });
});
