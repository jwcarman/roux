import { Input, InputGroup } from "@chakra-ui/react";
import { currencySymbol, organizationCurrency } from "../../money/money";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

/** A money field's props: its label, hint and required mark; the currency is the organization's. */
export type MoneyFieldProps = Omit<FormFieldProps, "children">;

/** An amount, typed as text (`150`, `150.50`) beside the organization's currency symbol; `money()` reads it. */
export function MoneyField({ label, helperText, required }: Readonly<MoneyFieldProps>) {
  const field = useFieldContext<string>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <InputGroup startElement={currencySymbol(organizationCurrency().currency)}>
        <Input
          name={field.name}
          inputMode="decimal"
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          onBlur={field.handleBlur}
        />
      </InputGroup>
    </FormField>
  );
}
