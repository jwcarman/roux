import { NativeSelect } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export interface Option {
  value: string;
  label: string;
}

export type SelectFieldProps = Omit<FormFieldProps, "children"> & {
  options: readonly Option[];
  /** Shown while nothing is chosen; the field's value is then "". */
  placeholder?: string;
};

/** A drop-down of `options` for a string field (the browser's own select: accessible everywhere). */
export function SelectField({ label, helperText, required, options, placeholder }: SelectFieldProps) {
  const field = useFieldContext<string>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <NativeSelect.Root>
        <NativeSelect.Field
          name={field.name}
          value={field.state.value}
          onChange={(event) => field.handleChange(event.target.value)}
          onBlur={field.handleBlur}
          placeholder={placeholder}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </FormField>
  );
}
