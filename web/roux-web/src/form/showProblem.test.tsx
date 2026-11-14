// @vitest-environment jsdom
import { act, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it } from "vitest";
import { Toaster, toaster } from "../feedback/toaster";
import { invalidFields, invariantViolation } from "../testing/problems";
import { renderWithProviders } from "../testing/render";
import { showProblem, useAppForm } from "./form";

function Harness({ answer, fieldNames }: { answer: () => Response; fieldNames?: Record<string, string> }) {
  const form = useAppForm({
    defaultValues: { name: "", email: "" },
    onSubmit: async () => showProblem(form, answer(), "Could not save", fieldNames),
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">{(field) => <field.InputField label="Name" />}</form.AppField>
        <form.AppField name="email">{(field) => <field.InputField label="Email" />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

async function submit(answer: () => Response, fieldNames?: Record<string, string>) {
  renderWithProviders(
    <>
      <Harness answer={answer} fieldNames={fieldNames} />
      <Toaster />
    </>,
  );
  await userEvent.setup().click(screen.getByRole("button", { name: "Save" }));
}

describe("showProblem", () => {
  afterEach(() => act(() => toaster.remove()));

  it("puts each field error under its field", async () => {
    await submit(() => invalidFields({ name: "Must be at most 100 characters" }));

    expect(await screen.findByText("Must be at most 100 characters")).toBeInTheDocument();
    expect(screen.getByLabelText("Name")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts the messages it cannot place, under the fallback title", async () => {
    await submit(() => invalidFields({ name: "Too odd", other: "Elsewhere" }));

    const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("Could not save");
    expect(alert).toHaveTextContent("Elsewhere");
    expect(screen.getByText("Too odd")).toBeInTheDocument();
  });

  it("toasts the server's reason for a problem without fields", async () => {
    await submit(() => invariantViolation("Already active"));

    expect(await screen.findByRole("alert")).toHaveTextContent("Already active");
  });

  it("toasts the fallback when the answer is not a problem", async () => {
    await submit(() => new Response("", { status: 502 }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Could not save");
  });

  it("puts a server field under the form field it is named to", async () => {
    await submit(() => invalidFields({ rule: "Pick at least one day" }), { rule: "email" });

    expect(await screen.findByText("Pick at least one day")).toBeInTheDocument();
    expect(screen.getByLabelText("Email")).toHaveAttribute("aria-invalid", "true");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("toasts several messages it cannot place together, separated by a space", async () => {
    await submit(() => invalidFields({ first: "Pick a day", second: "Pick a time" }));

    expect(await screen.findByRole("alert")).toHaveTextContent("Pick a day Pick a time");
  });
});
