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

  it("titles a problem by the failure and describes it with the server's detail", async () => {
    renderWithProviders(<Toaster />);
    act(() =>
      notify.problem(
        { type: "about:blank", title: "Conflict", status: 409, detail: "Another customer has this email address" },
        "Could not save the customer",
      ),
    );
    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save the customer");
    expect(document.querySelector("[data-part=description]")?.textContent).toBe(
      "Another customer has this email address",
    );
  });

  it("gives no description when the problem has neither detail nor reference", async () => {
    const create = vi.spyOn(toaster, "create");
    renderWithProviders(<Toaster />);
    act(() => notify.problem({ type: "about:blank", title: "Bad Gateway", status: 502 }, "Could not save the profile"));
    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save the profile");
    expect(document.querySelector("[data-part=description]")).toBeNull();
    expect(create).toHaveBeenCalledWith({ type: "error", title: "Could not save the profile", description: undefined });
    create.mockRestore();
  });

  it("puts the reference on its own line after the detail", async () => {
    renderWithProviders(<Toaster />);
    act(() =>
      notify.problem(
        {
          type: "about:blank",
          title: "Internal Server Error",
          status: 500,
          detail: "Another customer has this email address",
          errorId: "abc",
        },
        "Could not save",
      ),
    );
    await screen.findByRole("alert");
    expect(document.querySelector("[data-part=description]")?.textContent).toBe(
      "Another customer has this email address\nReference: abc",
    );
  });

  it("describes a problem with only a reference by the reference", async () => {
    renderWithProviders(<Toaster />);
    act(() =>
      notify.problem(
        { type: "about:blank", title: "Internal Server Error", status: 500, errorId: "7f3a" },
        "Could not save",
      ),
    );
    await screen.findByRole("alert");
    expect(document.querySelector("[data-part=description]")?.textContent).toBe("Reference: 7f3a");
  });
});
