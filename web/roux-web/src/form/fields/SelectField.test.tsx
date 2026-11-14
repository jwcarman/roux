// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";
import type { Option, SelectValue } from "./SelectField";

function Harness<V extends SelectValue>({
  initial,
  options,
  labels,
  placeholder,
  onSubmit,
}: {
  initial: V | "";
  options: readonly V[] | readonly Option<V>[];
  labels?: Partial<Record<string, string>>;
  placeholder?: string;
  onSubmit: (value: V | "") => void;
}) {
  const form = useAppForm({ defaultValues: { choice: initial }, onSubmit: ({ value }) => onSubmit(value.choice) });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="choice">
          {(field) => <field.SelectField label="Choice" options={options} labels={labels} placeholder={placeholder} />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

const optionTexts = () => screen.getAllByRole("option").map((option) => option.textContent);

async function chooseAndSave(label: string): Promise<void> {
  await userEvent.selectOptions(screen.getByLabelText("Choice"), label);
  await userEvent.click(screen.getByRole("button", { name: "Save" }));
}

describe("SelectField", () => {
  it("humanizes bare values", () => {
    renderWithProviders(<Harness initial="LEAD" options={["LEAD", "ON_HOLD"]} onSubmit={vi.fn()} />);

    expect(optionTexts()).toEqual(["Lead", "On hold"]);
  });

  it("takes a bare value's label from labels", () => {
    renderWithProviders(
      <Harness initial="LEAD" options={["LEAD", "ACTIVE"]} labels={{ LEAD: "Prospect" }} onSubmit={vi.fn()} />,
    );

    expect(optionTexts()).toEqual(["Prospect", "Active"]);
  });

  it("sets the field to a number option's number", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <Harness
        initial={30}
        options={[
          { value: 30, label: "Net 30" },
          { value: 60, label: "Net 60" },
        ]}
        onSubmit={onSubmit}
      />,
    );

    expect(screen.getByLabelText("Choice")).toHaveValue("30");
    await chooseAndSave("Net 60");

    expect(onSubmit).toHaveBeenCalledWith(60);
  });

  it("round-trips booleans as booleans", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(
      <Harness initial={false} options={[true, false]} labels={{ true: "Yes", false: "No" }} onSubmit={onSubmit} />,
    );

    await chooseAndSave("Yes");

    expect(onSubmit).toHaveBeenCalledWith(true);
  });

  it("sets the field to an empty string for the placeholder", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness initial="LEAD" options={["LEAD"]} placeholder="Pick one" onSubmit={onSubmit} />);

    await chooseAndSave("Pick one");

    expect(onSubmit).toHaveBeenCalledWith("");
  });
});
