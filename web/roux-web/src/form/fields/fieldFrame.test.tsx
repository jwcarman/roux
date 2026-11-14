// @vitest-environment jsdom
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";

interface Values {
  name: string;
  age: number | undefined;
}

function Harness({ onSubmit, onFormSubmit }: { onSubmit: (value: Values) => void; onFormSubmit?: () => void }) {
  const form = useAppForm({
    defaultValues: { name: "", age: undefined } as Values,
    onSubmit: ({ value }) => onSubmit(value),
  });
  const twoProblems = () => ["Enter a name", "Use letters only"];
  return (
    <div onSubmit={onFormSubmit}>
      <form.AppForm>
        <form.Form>
          <form.AppField name="name" validators={{ onSubmit: twoProblems }}>
            {(field) => <field.InputField label="Name" required />}
          </form.AppField>
          <form.AppField name="age">{(field) => <field.NumberField label="Age" />}</form.AppField>
          <form.SubmitButton>Save</form.SubmitButton>
        </form.Form>
      </form.AppForm>
    </div>
  );
}

describe("a field's frame", () => {
  it("marks a required field, and only a required field", () => {
    renderWithProviders(<Harness onSubmit={vi.fn()} />);

    expect(screen.getByText("Name").closest("label")).toHaveTextContent("*");
    expect(screen.getByText("Age").closest("label")).not.toHaveTextContent("*");
  });

  it("shows every message of a field's errors on one line, separated by a space", async () => {
    renderWithProviders(<Harness onSubmit={vi.fn()} />);

    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Enter a name Use letters only")).toBeInTheDocument();
  });
});

describe("the form element", () => {
  it("handles a submit itself: the browser does not navigate and no ancestor sees it", async () => {
    const onFormSubmit = vi.fn();
    renderWithProviders(<Harness onSubmit={vi.fn()} onFormSubmit={onFormSubmit} />);
    const form = screen.getByRole("button", { name: "Save" }).closest("form")!;

    const notCancelled = fireEvent.submit(form);
    await waitFor(() => expect(screen.getByText("Enter a name Use letters only")).toBeInTheDocument());

    expect(notCancelled).toBe(false);
    expect(onFormSubmit).not.toHaveBeenCalled();
  });
});

describe("NumberField", () => {
  it("starts empty when the field is undefined and shows what is typed", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness onSubmit={onSubmit} />);
    const age = screen.getByLabelText("Age");
    expect(age).toHaveValue("");

    await userEvent.type(age, "42");
    expect(age).toHaveValue("42");
  });

  it("gives undefined back to the form when the entry is cleared", async () => {
    renderWithProviders(<Harness onSubmit={vi.fn()} />);
    const age = screen.getByLabelText("Age");

    await userEvent.type(age, "42");
    await userEvent.clear(age);

    expect(age).toHaveValue("");
  });
});
