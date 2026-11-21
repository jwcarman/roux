// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import { paletteOf } from "../testing/css";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderHookWithProviders, renderWithProviders } from "../testing/render";
import { ConfirmProvider, useConfirm } from "./ConfirmProvider";

function Asker({ answers, destructive = true }: { answers: boolean[]; destructive?: boolean }) {
  const confirm = useConfirm();
  return (
    <Button
      onClick={async () =>
        answers.push(
          await confirm({
            title: "Deactivate Grace Hopper?",
            message: "She won't be able to sign in.",
            confirmLabel: "Deactivate",
            destructive,
          }),
        )
      }
    >
      Ask
    </Button>
  );
}

async function ask(destructive = true) {
  const answers: boolean[] = [];
  renderWithProviders(
    <ConfirmProvider>
      <Asker answers={answers} destructive={destructive} />
    </ConfirmProvider>,
  );
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Ask" }));
  const dialog = await screen.findByRole("alertdialog", { name: "Deactivate Grace Hopper?" });
  return { answers, user, dialog };
}

describe("useConfirm", () => {
  it("asks in an alert dialog named by its title, with its message", async () => {
    const { dialog } = await ask();
    expect(dialog).toHaveTextContent("She won't be able to sign in.");
  });

  it("puts focus on Cancel first, so Enter alone never confirms", async () => {
    // jsdom has no layout, so give every element a box or nothing counts as tabbable. Mark Cancel
    // as the one the dialog's own fallback skips, so only the provider's explicit choice can put
    // focus on it.
    const box = [new DOMRect(0, 0, 10, 10)] as unknown as DOMRectList;
    const boxes = vi.spyOn(HTMLElement.prototype, "getClientRects").mockReturnValue(box);
    const skipped = vi.spyOn(Element.prototype, "hasAttribute").mockImplementation(function (
      this: Element,
      name: string,
    ) {
      return name === "data-no-autofocus" && this.textContent === "Cancel" ? true : this.getAttribute(name) !== null;
    });
    try {
      await ask();
      await waitFor(() => expect(screen.getByRole("button", { name: "Cancel" })).toHaveFocus());
    } finally {
      skipped.mockRestore();
      boxes.mockRestore();
    }
  });

  it("paints the confirm button red when the action is destructive", async () => {
    await ask(true);
    expect(paletteOf(screen.getByRole("button", { name: "Deactivate" }))).toBe("red");
  });

  it("leaves the confirm button in the default palette otherwise", async () => {
    await ask(false);
    expect(paletteOf(screen.getByRole("button", { name: "Deactivate" }))).not.toBe("red");
  });

  it("answers once when a button is pressed again after the dialog has closed", async () => {
    const { answers, user } = await ask();
    const confirmButton = screen.getByRole("button", { name: "Deactivate" });
    await user.click(confirmButton);
    await waitFor(() => expect(answers).toEqual([true]));

    fireEvent.click(confirmButton);

    expect(answers).toEqual([true]);
  });

  it("answers true when confirmed", async () => {
    const { answers, user, dialog } = await ask();
    await user.click(screen.getByRole("button", { name: "Deactivate" }));
    await waitFor(() => expect(answers).toEqual([true]));
    // Closed (jsdom never runs the exit animation that removes it).
    expect(dialog).toHaveAttribute("data-state", "closed");
  });

  it("answers false on Cancel", async () => {
    const { answers, user } = await ask();
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() => expect(answers).toEqual([false]));
  });

  it("answers false on Escape", async () => {
    const { answers, user } = await ask();
    await user.keyboard("{Escape}");
    await waitFor(() => expect(answers).toEqual([false]));
  });

  it("answers false when closed", async () => {
    const { answers, user } = await ask();
    await user.click(screen.getByRole("button", { name: "Close" }));
    await waitFor(() => expect(answers).toEqual([false]));
  });
});

describe("useConfirm outside a provider", () => {
  it("fails with a message that names the missing provider", () => {
    expect(() => renderHookWithProviders(() => useConfirm())).toThrow("useConfirm outside ConfirmProvider");
  });
});

describe("useConfirm across renders", () => {
  it("hands every render the same function", () => {
    const seen: unknown[] = [];
    function Probe() {
      seen.push(useConfirm());
      return null;
    }
    const { rerender } = renderWithProviders(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>,
    );
    rerender(
      <ConfirmProvider>
        <Probe />
      </ConfirmProvider>,
    );

    expect(new Set(seen).size).toBe(1);
  });
});
