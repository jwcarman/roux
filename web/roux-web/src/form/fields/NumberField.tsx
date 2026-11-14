import { NumberInput } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export type NumberFieldProps = Omit<FormFieldProps, "children"> & {
  min?: number;
  max?: number;
  step?: number;
};

/** A number input; an empty or unreadable entry is `undefined`, never NaN. */
export function NumberField({ label, helperText, required, min, max, step }: NumberFieldProps) {
  const field = useFieldContext<number | undefined>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <NumberInput.Root
        name={field.name}
        value={field.state.value === undefined ? "" : String(field.state.value)}
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
