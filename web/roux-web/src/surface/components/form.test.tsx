// @vitest-environment jsdom
import { fireEvent, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it } from "vitest";
import { FieldApi, FormApi, type AnyFieldApi } from "@tanstack/react-form";
import { renderSurface } from "../testSurface";
import { opsOf, writeBack } from "./form";

const required = (path: string, message: string) => ({
  condition: { "@call": "required", args: { value: { "@path": path } } },
  message,
});

const components = [
  { id: "root", component: "Form", children: ["name", "email", "kind"] },
  {
    id: "name",
    component: "InputField",
    label: "Name",
    value: { "@path": "/draft/name" },
    serverError: { "@path": "/errors/name" },
    "@checks": [required("/draft/name", "Name is required")],
  },
  {
    id: "email",
    component: "InputField",
    label: "Email",
    type: "email",
    value: { "@path": "/draft/email" },
    serverError: { "@path": "/errors/email" },
    "@checks": [
      required("/draft/email", "Email is required"),
      {
        condition: { "@call": "email", args: { value: { "@path": "/draft/email" } } },
        message: "That doesn't look like an email",
      },
    ],
  },
  {
    id: "kind",
    component: "SelectField",
    label: "Kind",
    value: { "@path": "/draft/kind" },
    options: [
      { value: "home", label: "Home" },
      { value: "business", label: "Business" },
    ],
    placeholder: "Choose one",
  },
];

const data = () => ({ draft: { name: "", email: "", kind: "" }, errors: { name: "", email: "" } });

describe("form bridge", () => {
  it("typing writes the data model", async () => {
    const surface = renderSurface(components, data());
    await userEvent.type(screen.getByLabelText("Name"), "Ann");
    expect(surface.read("/draft/name")).toBe("Ann");
  });

  it("choosing writes the data model", async () => {
    const surface = renderSurface(components, data());
    await userEvent.selectOptions(screen.getByLabelText("Kind"), "business");
    expect(surface.read("/draft/kind")).toBe("business");
  });

  it("a data-model update fills the field", () => {
    const surface = renderSurface(components, data());
    surface.write("/draft/name", "Bea");
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bea");
  });

  it("a reset clears errors", async () => {
    const surface = renderSurface(components, data());
    const name = screen.getByLabelText("Name");
    await userEvent.type(name, "Ann");
    await userEvent.clear(name);
    await userEvent.tab();
    expect(screen.getByText("Name is required")).toBeTruthy();
    await userEvent.type(name, "Ann");
    await userEvent.tab();
    // A save succeeded, and the app empties the draft: the field starts fresh, not "left empty".
    surface.write("/draft/name", "");
    expect((name as HTMLInputElement).value).toBe("");
    expect(screen.queryByText("Name is required")).toBeNull();
  });

  it("shows only the first failing check", () => {
    renderSurface(components, data());
    const email = screen.getByLabelText("Email");
    fireEvent.focus(email);
    fireEvent.blur(email);
    expect(screen.getByText("Email is required")).toBeTruthy();
    expect(screen.queryByText(/doesn't look like an email/)).toBeNull();
  });

  it("server error shows at once", () => {
    const surface = renderSurface(components, {
      ...data(),
      draft: { name: "Ann", email: "ann@hartleybakery.com", kind: "" },
    });
    surface.write("/errors/email", "Hartley Bakery is already a customer");
    expect(screen.getByText("Hartley Bakery is already a customer")).toBeTruthy();
  });

  it("marks each field with its component id", () => {
    const { view } = renderSurface(components, data());
    expect(view.container.querySelector('[data-component-id="email"]')).not.toBeNull();
    expect(view.container.querySelector('[data-component-id="root"]')).not.toBeNull();
  });

  it("says so when a field is outside a Form", () => {
    renderSurface([{ id: "root", component: "InputField", label: "Name", value: { "@path": "/name" } }], { name: "" });
    expect(screen.getByText("An input field must be inside a Form")).toBeTruthy();
  });

  it("shows a field's helper text", () => {
    renderSurface(
      [
        { id: "root", component: "Form", children: ["name"] },
        {
          id: "name",
          component: "InputField",
          label: "Name",
          value: { "@path": "/name" },
          helperText: "As on the lease",
        },
      ],
      { name: "" },
    );
    expect(screen.getByText("As on the lease")).toBeTruthy();
  });

  it("takes plain strings as options", async () => {
    const surface = renderSurface(
      [
        { id: "root", component: "Form", children: ["size"] },
        {
          id: "size",
          component: "SelectField",
          label: "Size",
          value: { "@path": "/size" },
          options: { "@path": "/sizes" },
        },
      ],
      { size: "", sizes: ["small", "large"] },
    );
    await userEvent.selectOptions(screen.getByLabelText("Size"), "large");
    expect(surface.read("/size")).toBe("large");
  });

  it("shows no options until the list is there", () => {
    renderSurface(
      [
        { id: "root", component: "Form", children: ["size"] },
        {
          id: "size",
          component: "SelectField",
          label: "Size",
          value: { "@path": "/size" },
          options: { "@path": "/sizes" },
        },
      ],
      { size: "" },
    );
    expect(screen.getByLabelText("Size").querySelectorAll("option:not([value=''])")).toHaveLength(0);
  });

  it("clears a shown error when the data model gets a value that passes", () => {
    const surface = renderSurface(components, data());
    const name = screen.getByLabelText("Name");
    fireEvent.focus(name);
    fireEvent.blur(name);
    expect(screen.getByText("Name is required")).toBeTruthy();
    surface.write("/draft/name", "Bea");
    expect(screen.queryByText("Name is required")).toBeNull();
  });

  it("keeps a shown error while the person empties the field again", async () => {
    renderSurface(components, data());
    const name = screen.getByLabelText("Name");
    await userEvent.type(name, "Ann");
    await userEvent.clear(name);
    await userEvent.tab();
    expect(screen.getByText("Name is required")).toBeTruthy();
    await userEvent.type(name, "A");
    await userEvent.keyboard("{Backspace}");
    expect(screen.getByText("Name is required")).toBeTruthy();
  });

  it("keeps a shown error when the data model gets another value that fails", () => {
    const surface = renderSurface(components, { ...data(), draft: { name: "", email: "bad", kind: "" } });
    const email = screen.getByLabelText("Email");
    fireEvent.focus(email);
    fireEvent.blur(email);
    expect(screen.getByText("That doesn't look like an email")).toBeTruthy();
    surface.write("/draft/email", "worse");
    expect(screen.getByText("That doesn't look like an email")).toBeTruthy();
    expect(screen.getByLabelText<HTMLInputElement>("Email").value).toBe("worse");
  });

  it("fills a field the person has already used", async () => {
    const surface = renderSurface(components, data());
    await userEvent.type(screen.getByLabelText("Name"), "Ann");
    await userEvent.tab();
    surface.write("/draft/name", "Bea");
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bea");
  });

  it("shows a value that is not text as empty", () => {
    renderSurface(components, { ...data(), draft: { name: 5, email: "", kind: "" } });
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("");
  });

  it("makes a text input unless told otherwise", () => {
    renderSurface(components, data());
    expect(screen.getByLabelText("Name").getAttribute("type")).toBe("text");
    expect(screen.getByLabelText("Email").getAttribute("type")).toBe("email");
  });

  it("shows a drop-down's helper text and the server's message for it, when there are any", () => {
    const select = (extra: Record<string, unknown>) => [
      { id: "root", component: "Form", children: ["size"] },
      {
        id: "size",
        component: "SelectField",
        label: "Size",
        value: { "@path": "/size" },
        options: ["small", "large"],
        ...extra,
      },
    ];
    const { view } = renderSurface(select({ helperText: "Pick one" }), { size: "" });
    expect(screen.getByText("Pick one")).toBeTruthy();
    view.unmount();
    renderSurface(select({ serverError: { "@path": "/error" } }), { size: "", error: "Too big" });
    expect(screen.getByText("Too big")).toBeTruthy();
  });

  it("shows a drop-down with neither", () => {
    renderSurface(
      [
        { id: "root", component: "Form", children: ["size"] },
        { id: "size", component: "SelectField", label: "Size", value: { "@path": "/size" }, options: ["small"] },
      ],
      { size: "" },
    );
    expect(screen.queryByText("true")).toBeNull();
    expect(document.querySelectorAll("[data-part='error-text'], [data-part='helper-text']")).toHaveLength(0);
  });

  it("does not surface a check error for a value written from outside", () => {
    const surface = renderSurface(components, data());
    surface.write("/draft/email", "bad");
    expect(screen.queryByText("That doesn't look like an email")).toBeNull();
    surface.write("/draft/email", "");
    expect(screen.queryByText("Email is required")).toBeNull();
  });

  it("leaves a field untouched and clean after a value is written from outside", async () => {
    const surface = renderSurface(components, data());
    surface.write("/draft/name", "Bea");
    // A touched or dirty field would take its next default from the field, not the data model.
    expect(screen.getByLabelText<HTMLInputElement>("Name").value).toBe("Bea");
    await userEvent.click(screen.getByLabelText("Name"));
    await userEvent.tab();
    surface.write("/draft/name", "");
    expect(screen.queryByText("Name is required")).toBeNull();
  });

  it("writes nothing back to the data model for a value written from outside", async () => {
    const surface = renderSurface(components, data());
    const seen: unknown[] = [];
    surface.watch("/draft/name", (value) => seen.push(value));
    surface.write("/draft/name", "Bea");
    expect(seen).toEqual(["Bea"]);
    await userEvent.type(screen.getByLabelText("Name"), "x");
    expect(seen).toEqual(["Bea", "Beax"]);
  });
});

describe("the bridge's field operations", () => {
  const fieldOf = (value: string) => {
    const form = new FormApi({ defaultValues: { name: "" } });
    const field = new FieldApi({ form, name: "name", defaultValue: value });
    field.mount();
    return field as unknown as AnyFieldApi;
  };

  it("fills a field without touching it or making it dirty", () => {
    const field = fieldOf("");
    opsOf(field).fill("Bea");
    expect(field.state.value).toBe("Bea");
    expect(field.state.meta.isTouched).toBe(false);
    expect(field.state.meta.isDirty).toBe(false);
  });

  it("writes a field's value back only when the data model does not hold it", () => {
    const written: string[] = [];
    const sync = { value: "Bea", setValue: (text: string) => written.push(text) };
    writeBack("Bea", sync);
    expect(written).toEqual([]);
    writeBack("Bo", sync);
    expect(written).toEqual(["Bo"]);
  });
});
