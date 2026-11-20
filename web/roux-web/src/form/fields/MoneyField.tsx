import { Input, InputGroup } from "@chakra-ui/react";
import { currencySymbol, type MoneySettings } from "../../money/money";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export type MoneyFieldProps = Omit<FormFieldProps, "children"> & {
  /** The app's currency (`moneySettingsQuery`); its symbol sits before the input. */
  settings: MoneySettings;
};

/** An amount, typed as text (`150`, `150.50`) beside the currency's symbol; `money()` reads it. */
export function MoneyField({ label, helperText, required, settings }: MoneyFieldProps) {
  const field = useFieldContext<string>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <InputGroup startElement={currencySymbol(settings.currency)}>
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
