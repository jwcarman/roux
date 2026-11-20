// @vitest-environment jsdom
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { z } from "zod";
import type { Money, MoneySettings } from "../../money/money";
import { renderWithProviders } from "../../testing/render";
import { useAppForm } from "../form";
import { money } from "../rules";
import { moneyInputOf } from "../values";

const USD: MoneySettings = { currency: "USD", fractionDigits: 2 };

function Harness({ initial, onSubmit }: { initial: string; onSubmit: (price: Money) => void }) {
  const schema = z.object({ price: money(USD).positive() });
  const form = useAppForm({
    defaultValues: { price: initial },
    validators: { onSubmit: schema },
    onSubmit: ({ value }) => onSubmit(schema.parse(value).price),
  });
  return (
    <form.AppForm>
      <form.Form>
        <form.AppField name="price">{(field) => <field.MoneyField label="Price" settings={USD} />}</form.AppField>
        <form.SubmitButton>Save</form.SubmitButton>
      </form.Form>
    </form.AppForm>
  );
}

describe("MoneyField", () => {
  it("submits what is typed as minor units", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness initial="" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^Price/), "150");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    await vi.waitFor(() => expect(onSubmit).toHaveBeenCalledWith({ minorUnits: 15000, currency: "USD" }));
  });

  it("shows a mistake under the field", async () => {
    const onSubmit = vi.fn();
    renderWithProviders(<Harness initial="" onSubmit={onSubmit} />);

    await userEvent.type(screen.getByLabelText(/^Price/), "abc");
    await userEvent.click(screen.getByRole("button", { name: "Save" }));

    expect(await screen.findByText("Must be an amount")).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("shows the currency's symbol beside the input and starts from a saved amount", () => {
    renderWithProviders(<Harness initial={moneyInputOf({ minorUnits: 15050, currency: "USD" }, USD)} onSubmit={vi.fn()} />);

    expect(screen.getByText("$")).toBeInTheDocument();
    expect(screen.getByLabelText(/^Price/)).toHaveValue("150.50");
    expect(screen.getByLabelText(/^Price/)).toHaveAttribute("inputmode", "decimal");
  });

  it("starts empty without an amount", () => {
    expect(moneyInputOf(null, USD)).toBe("");
    expect(moneyInputOf({ minorUnits: 150, currency: "JPY" }, { currency: "JPY", fractionDigits: 0 })).toBe("150");
    expect(moneyInputOf({ minorUnits: 5, currency: "USD" }, USD)).toBe("0.05");
  });
});
