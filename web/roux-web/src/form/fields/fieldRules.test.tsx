// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { renderHookWithProviders, renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";
import { text } from "../rules";
import { useSchemaForm } from "../schemaForm";
import { rulesOfField } from "./fieldRules";

const schema = z.object({
  name: text().max(100),
  company: text().optional(),
  address: z.object({ street: text() }),
  items: z.array(z.object({ title: text().max(7) })),
  tags: z.array(text().max(20)),
  notes: z.string().refine((value) => value !== "x"),
  done: z.boolean(),
});

const defaultValues = {
  name: "",
  company: "",
  address: { street: "" },
  items: [{ title: "" }],
  tags: [""],
  notes: "",
  done: false,
};

function useSchemaFormOf() {
  return useSchemaForm({ schema, defaultValues, mutation: { mutationFn: () => Promise.resolve(null) } });
}

describe("rulesOfField", () => {
  it("reads a required field's rules and its maxLength", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(rulesOfField(result.current, "name")).toEqual({ required: true, maxLength: 100 });
  });

  it("reads an optional field as not required", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(rulesOfField(result.current, "company")).toEqual({ required: false });
  });

  it("walks into a nested object and an array's elements", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(rulesOfField(result.current, "address.street")).toEqual({ required: true });
    expect(rulesOfField(result.current, "items[0].title")).toEqual({ required: true, maxLength: 7 });
    expect(rulesOfField(result.current, "tags[0]")).toEqual({ required: true, maxLength: 20 });
  });

  it("is not required for a name the schema lacks, or one that steps into a leaf", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(rulesOfField(result.current, "missing")).toEqual({ required: false });
    expect(rulesOfField(result.current, "name.deeper")).toEqual({ required: false });
  });

  it("refuses a field of a schema the helpers did not build, naming the field and the fix", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(() => rulesOfField(result.current, "notes")).toThrow(
      new Error(
        `The schema of field "notes" is not one of roux's rules, so the field cannot show whether it is ` +
          "required or how long it may be. Build it with a rule from @jwcarman/roux-web/form (text(), email(), " +
          "date(), oneOf(), ...); a .transform() or .pipe() makes a new schema, so keep them out of a form's " +
          "schema; a rule of your own ends with .register(fieldRules, { required }).",
      ),
    );
  });

  it("is not required for a checkbox's boolean", () => {
    const { result } = renderHookWithProviders(useSchemaFormOf);
    expect(rulesOfField(result.current, "done")).toEqual({ required: false });
  });

  it("is not required in a form with no schema", () => {
    const { result } = renderHookWithProviders(() => useAppForm({ defaultValues: { name: "" } }));
    expect(rulesOfField(result.current, "name")).toEqual({ required: false });
  });
});

function Rendered({ nameRequired }: { nameRequired?: boolean }) {
  const form = useSchemaFormOf();
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="name">{(f) => <f.InputField label="Name" required={nameRequired} />}</form.AppField>
        <form.AppField name="company">{(f) => <f.InputField label="Company" />}</form.AppField>
      </form.Form>
    </form.AppForm>
  );
}

describe("fields of a schema form", () => {
  it("show the schema's required indicator and maxLength", () => {
    renderWithProviders(<Rendered />);

    expect(screen.getByText("Name").closest("label")).toHaveTextContent("*");
    expect(screen.getByRole("textbox", { name: /Name/ })).toHaveAttribute("maxlength", "100");
    expect(screen.getByText("Company").closest("label")).not.toHaveTextContent("*");
    expect(screen.getByRole("textbox", { name: "Company" })).not.toHaveAttribute("maxlength");
  });

  it("let a required prop override the schema", () => {
    renderWithProviders(<Rendered nameRequired={false} />);

    expect(screen.getByText("Name").closest("label")).not.toHaveTextContent("*");
  });
});
