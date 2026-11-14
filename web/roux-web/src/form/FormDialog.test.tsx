// @vitest-environment jsdom
import { Button } from "@chakra-ui/react";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { useAppForm } from "./form";
import { renderWithProviders } from "../testing/render";
import { FormDialog } from "./FormDialog";

function Harness({ onSave }: { onSave: (name: string) => Promise<boolean> }) {
  const [open, setOpen] = useState(false);
  const form = useAppForm({
    defaultValues: { name: "" },
    onSubmit: async ({ value }) => {
      if (await onSave(value.name)) {
        setOpen(false);
      }
    },
  });
  return (
    <>
      <Button onClick={() => form.setFieldValue("name", "Draft")}>Prefill</Button>
      <FormDialog
        form={form}
        title="Name something"
        trigger={<Button>Open</Button>}
        submitLabel="Save"
        open={open}
        onOpenChange={setOpen}
      >
        <form.AppField name="name">{(field) => <field.InputField label="Name" />}</form.AppField>
      </FormDialog>
    </>
  );
}

async function openDialog(onSave: (name: string) => Promise<boolean> = () => Promise.resolve(true)) {
  const save = vi.fn(onSave);
  renderWithProviders(<Harness onSave={save} />);
  const user = userEvent.setup();
  await user.click(screen.getByRole("button", { name: "Open" }));
  const dialog = await screen.findByRole("dialog", { name: "Name something" });
  return { save, user, dialog };
}

describe("FormDialog", () => {
  it("opens a dialog named by its title, holding the form", async () => {
    const { dialog } = await openDialog();
    expect(dialog).toContainElement(screen.getByLabelText("Name"));
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });

  it("submits the form from the footer and closes when the caller says it saved", async () => {
    const { save, user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(save).toHaveBeenCalledWith("Ada"));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));
  });

  it("saves again when opened again after a save", async () => {
    const { save, user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));

    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "open"),
    );
    await user.type(screen.getByLabelText("Name"), "Grace");
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(save).toHaveBeenCalledTimes(2));
    expect(save).toHaveBeenLastCalledWith("Grace");
  });

  it("stays open when the save fails", async () => {
    const { user, dialog } = await openDialog(() => Promise.resolve(false));
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "open"));
  });

  it("closes on Escape and on Cancel, and starts empty when opened again", async () => {
    const { user, dialog } = await openDialog();
    await user.type(screen.getByLabelText("Name"), "Ada");
    await user.keyboard("{Escape}");
    await waitFor(() => expect(dialog).toHaveAttribute("data-state", "closed"));

    await user.click(screen.getByRole("button", { name: "Open" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "open"),
    );
    expect(screen.getByLabelText("Name")).toHaveValue("");
    await user.click(screen.getByRole("button", { name: "Cancel" }));
    await waitFor(() =>
      expect(screen.getByRole("dialog", { name: "Name something" })).toHaveAttribute("data-state", "closed"),
    );
  });

  it("does not empty the form as it opens, only once it has closed", async () => {
    renderWithProviders(<Harness onSave={() => Promise.resolve(true)} />);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Prefill" }));

    await user.click(screen.getByRole("button", { name: "Open" }));

    expect(await screen.findByLabelText("Name")).toHaveValue("Draft");
  });
});
