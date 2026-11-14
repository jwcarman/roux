import { NumberInput } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export type NumberFieldProps = Omit<FormFieldProps, "children"> & {
  min?: number;
  max?: number;
  step?: number;
};

/** What the input shows for the field's value: nothing for `undefined`. */
export function numberTextOf(value: number | undefined): string {
  return value === undefined ? "" : String(value);
}

/** A number input; an empty or unreadable entry is `undefined`, never NaN. */
export function NumberField({ label, helperText, required, min, max, step }: NumberFieldProps) {
  const field = useFieldContext<number | undefined>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <NumberInput.Root
        name={field.name}
        value={numberTextOf(field.state.value)}
        onValueChange={({ valueAsNumber }) =>
          field.handleChange(Number.isFinite(valueAsNumber) ? valueAsNumber : undefined)
        }
        min={min}
        max={max}
        step={step}
      >
        <NumberInput.Control />
        <NumberInput.Input onBlur={field.handleBlur} />
      </NumberInput.Root>
    </FormField>
  );
}
