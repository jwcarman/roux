import { Input, type InputProps } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

export type InputFieldProps = Omit<InputProps, "value" | "onChange" | "onBlur" | "name" | "required"> &
  Omit<FormFieldProps, "children">;

/** A text input (or email, password, search: any `type`) for a string field. */
export function InputField({ label, helperText, required, ...props }: InputFieldProps) {
  const field = useFieldContext<string>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <Input
        name={field.name}
        value={field.state.value}
        onChange={(event) => field.handleChange(event.target.value)}
        onBlur={field.handleBlur}
        {...props}
      />
    </FormField>
  );
}
