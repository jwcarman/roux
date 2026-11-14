import { Checkbox } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export type CheckboxFieldProps = Omit<FormFieldProps, "children" | "controlLabelled">;

/** A checkbox for a boolean field, named by its own label. */
export function CheckboxField({ label, helperText, required }: CheckboxFieldProps) {
  const field = useFieldContext<boolean>();
  return (
    <FormField label={label} helperText={helperText} required={required} controlLabelled>
      <Checkbox.Root
        name={field.name}
        checked={field.state.value}
        onCheckedChange={({ checked }) => field.handleChange(checked === true)}
      >
        <Checkbox.HiddenInput onBlur={field.handleBlur} />
        <Checkbox.Control />
        <Checkbox.Label>{label}</Checkbox.Label>
      </Checkbox.Root>
    </FormField>
  );
}
