// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { renderWithProviders } from "../testing/render";
import { ConfirmProvider, useConfirm } from "./ConfirmProvider";

function Asker({ answers }: { answers: boolean[] }) {
  const confirm = useConfirm();
  return (
    <Button
      onClick={async () =>
        answers.push(
          await confirm({
            title: "Deactivate Grace Hopper?",
            message: "She won't be able to sign in.",
            confirmLabel: "Deactivate",
            destructive: true,
          }),
        )
      }
    >
      Ask
    </Button>
  );
}

async function ask() {
  const answers: boolean[] = [];
  renderWithProviders(
    <ConfirmProvider>
      <Asker answers={answers} />
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
