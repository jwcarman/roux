// @vitest-environment jsdom
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../testing/render";
import { showServerErrors, useAppForm } from "./form";

interface Values {
  name: string;
  email: string;
  age: number | undefined;
  notes: string;
  size: string;
  color: string;
}

const DEFAULTS: Values = { name: "", email: "", age: undefined, notes: "", size: "", color: "" };

type Submit = (value: Values, unplaced: (fields: Record<string, string>) => string[]) => Promise<void> | void;

function Harness({ onSubmit }: { onSubmit: Submit }) {
  const form = useAppForm({
    defaultValues: DEFAULTS,
    onSubmit: async ({ value }) => onSubmit(value, (fields) => showServerErrors(form, fields)),
  });
  const required = ({ value }: { value: string }) => (value.trim() ? undefined : "Enter a name");
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name" validators={{ onChange: required, onSubmit: required }}>
          {(field) => <field.InputField label="Name" required helperText="As other members see it" />}
        </form.AppField>
        <form.AppField
          name="email"
          validators={{ onBlur: ({ value }) => (value.includes("@") ? undefined : { message: "Enter an email" }) }}
        >
          {(field) => <field.InputField label="Email" type="email" />}
        </form.AppField>
        <form.AppField name="age">{(field) => <field.NumberField label="Age" />}</form.AppField>
        <form.AppField name="notes">{(field) => <field.TextAreaField label="Notes" />}</form.AppField>
        <form.AppField name="size">
          {(field) => (
            <field.SelectField
              label="Size"
              placeholder="Pick one"
              options={[
                { value: "S", label: "Small" },
                { value: "L", label: "Large" },
              ]}
            />
          )}
        </form.AppField>
        <form.AppField name="color">
          {(field) => (
            <field.RadioGroupField
              label="Color"
              options={[
                { value: "red", label: "Red" },
                { value: "blue", label: "Blue" },
              ]}
            />
          )}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
        <form.ResetButton />
        <form.SubmittingIndicator />
      </form.Form>
    </form.AppForm>
  );
}

function show(onSubmit: Submit = () => undefined) {
  const spy = vi.fn(onSubmit);
  renderWithProviders(<Harness onSubmit={spy} />);
  return { onSubmit: spy, user: userEvent.setup() };
}

const name = () => screen.getByRole("textbox", { name: /^Name/ });
const email = () => screen.getByRole("textbox", { name: "Email" });

describe("the form helpers", () => {
  it("label each field, and show its hint", () => {
    show();
    expect(name()).toBeRequired();
    expect(name()).toHaveAccessibleDescription("As other members see it");
    expect(screen.getByRole("spinbutton", { name: "Age" })).toBeInTheDocument();
    expect(screen.getByRole("textbox", { name: "Notes" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Size" })).toBeInTheDocument();
    expect(screen.getByRole("radiogroup", { name: "Color" })).toBeInTheDocument();
  });

  it("say nothing while a first entry is typed, and show the error once the field is left", async () => {
    const { user } = show();
    await user.type(email(), "ada");
    expect(email()).not.toHaveAttribute("aria-invalid");
    expect(screen.queryByText("Enter an email")).toBeNull();

    await user.tab();
    expect(await screen.findByText("Enter an email")).toBeInTheDocument();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(email()).toHaveAccessibleDescription("Enter an email");
  });

  it("hold back an error found while typing until the field is left", async () => {
    const { user } = show();
    await user.type(name(), "A{Backspace}");
    expect(screen.queryByText("Enter a name")).toBeNull();
    expect(name()).not.toHaveAttribute("aria-invalid");

    await user.tab();
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
  });

  it("show a validator's error object by its message", async () => {
    const { user } = show();
    await user.type(email(), "x");
    await user.tab();
    expect(await screen.findByText("Enter an email")).toBeInTheDocument();
    expect(screen.queryByText(/object Object/)).toBeNull();
  });

  it("show every error on submit, and do not submit an invalid form", async () => {
    const { user, onSubmit } = show();
    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("show every field's error on submit, even when one was already flagged", async () => {
    const { user, onSubmit } = show();
    await user.type(email(), "ada");
    await user.tab();
    expect(await screen.findByText("Enter an email")).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: "Save" }));
    expect(await screen.findByText("Enter a name")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("submit once per click, with the values", async () => {
    const { user, onSubmit } = show();
    await user.type(name(), "Ada");
    await user.type(email(), "ada@example.com");
    await user.type(screen.getByRole("spinbutton", { name: "Age" }), "36");
    await user.type(screen.getByRole("textbox", { name: "Notes" }), "First programmer");
    await user.selectOptions(screen.getByRole("combobox", { name: "Size" }), "L");
    await user.click(screen.getByRole("radio", { name: "Blue" }));
    await user.click(screen.getByRole("button", { name: "Save" }));

    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    expect(onSubmit.mock.calls[0][0]).toEqual({
      name: "Ada",
      email: "ada@example.com",
      age: 36,
      notes: "First programmer",
      size: "L",
      color: "blue",
    });
  });

  it("submit with Enter in a field, once", async () => {
    const { user, onSubmit } = show();
    await user.type(email(), "ada@example.com");
    await user.type(name(), "Ada{Enter}");
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
  });

  it("are busy while submitting, so a second click sends nothing", async () => {
    let finish: () => void = () => undefined;
    const { user, onSubmit } = show(() => new Promise<void>((resolve) => (finish = resolve)));
    await user.type(name(), "Ada");
    await user.type(email(), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByRole("status")).toHaveTextContent("Saving…");
    expect(screen.getByRole("button", { name: /Save/ })).toBeDisabled();
    await user.click(screen.getByRole("button", { name: /Save/ }));
    expect(onSubmit).toHaveBeenCalledTimes(1);

    finish();
    await waitFor(() => expect(screen.queryByRole("status")).toBeNull());
    expect(screen.getByRole("button", { name: "Save" })).toBeEnabled();
  });

  it("read an empty number as undefined, not NaN", async () => {
    const { user, onSubmit } = show();
    await user.type(name(), "Ada");
    await user.type(email(), "ada@example.com");
    const age = screen.getByRole("spinbutton", { name: "Age" });
    await user.type(age, "5");
    await user.clear(age);
    await user.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0][0].age).toBeUndefined();
  });

  it("show the server's messages under their fields, and clear one when its field is edited", async () => {
    const unplaced: string[][] = [];
    const { user } = show((_, place) => {
      unplaced.push(place({ email: "That address is taken", captcha: "Prove you are human" }));
    });
    await user.type(name(), "Ada");
    await user.type(email(), "ada@example.com");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("That address is taken")).toBeInTheDocument();
    expect(email()).toHaveAttribute("aria-invalid", "true");
    expect(unplaced).toEqual([["Prove you are human"]]);

    await user.type(email(), "m");
    expect(screen.queryByText("That address is taken")).toBeNull();
  });

  it("put every field back with the reset button", async () => {
    const { user } = show();
    await user.type(name(), "Ada");
    await user.click(screen.getByRole("button", { name: "Reset" }));
    expect(name()).toHaveValue("");
  });
});
