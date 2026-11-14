// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";

function Harness({ onSubmit, initial }: { onSubmit: (done: boolean) => void; initial: boolean }) {
  const form = useAppForm({ defaultValues: { done: initial }, onSubmit: ({ value }) => onSubmit(value.done) });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="done">{(field) => <field.CheckboxField label="Done" />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

describe("CheckboxField", () => {
  it("is named by its label and starts from the field's value", () => {
    renderWithProviders(<Harness onSubmit={vi.fn()} initial={true} />);

    expect(screen.getByRole("checkbox", { name: "Done" })).toBeChecked();
  });

  it("sets the field to true when checked and false when unchecked", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness onSubmit={onSubmit} initial={false} />);
    const box = screen.getByRole("checkbox", { name: "Done" });

    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(true);

    await userEvent.click(box);
    await userEvent.click(screen.getByRole("button", { name: "Save" }));
    expect(onSubmit).toHaveBeenLastCalledWith(false);
  });
});
