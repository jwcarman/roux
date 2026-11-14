// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";

const OPTIONS = [
  { value: "low", label: "Low" },
  { value: "high", label: "High" },
];

function Harness({
  onSubmit,
  orientation,
}: {
  onSubmit: (priority: string) => void;
  orientation?: "horizontal" | "vertical";
}) {
  const form = useAppForm({ defaultValues: { priority: "low" }, onSubmit: ({ value }) => onSubmit(value.priority) });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="priority">
          {(field) => <field.RadioGroupField label="Priority" options={OPTIONS} orientation={orientation} />}
        </form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

/** The flex direction the stylesheet gives the stack that holds the option `radio` belongs to. */
function directionOf(radio: HTMLElement): string | undefined {
  const stack = radio.closest("[data-part='item']")!.parentElement!;
  const rules = Array.from(document.styleSheets).flatMap((sheet) => Array.from(sheet.cssRules));
  const own = rules.find(
    (rule): rule is CSSStyleRule => rule instanceof CSSStyleRule && stack.matches(rule.selectorText) && rule.style.flexDirection !== "",
  );
  return own?.style.flexDirection;
}

describe("RadioGroupField", () => {
  it("is a group named by its label, starting from the field's value", () => {
    renderWithProviders(<Harness onSubmit={vi.fn()} />);

    expect(screen.getByRole("radiogroup", { name: "Priority" })).toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Low" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "High" })).not.toBeChecked();
  });

  it("sets the field to the chosen option", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness onSubmit={onSubmit} />);

    await userEvent.click(screen.getByRole("radio", { name: "High" }));
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(onSubmit).toHaveBeenCalledWith("high");
  });

  it("stacks the options in a column by default and in a row when horizontal", () => {
    const vertical = renderWithProviders(<Harness onSubmit={vi.fn()} />);
    expect(directionOf(screen.getByRole("radio", { name: "Low" }))).toBe("column");
    vertical.unmount();

    renderWithProviders(<Harness onSubmit={vi.fn()} orientation="horizontal" />);
    expect(directionOf(screen.getByRole("radio", { name: "Low" }))).toBe("row");
  });
});
