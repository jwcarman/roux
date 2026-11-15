import { Input, type InputProps } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { rulesOfField } from "./fieldRules";
import { FormField, type FormFieldProps } from "./FormField";

/** What InputField takes: the field's label and hint, and any Chakra `Input` props but its value's. */
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
        maxLength={rulesOfField(field.form, field.name).maxLength}
        {...props}
      />
    </FormField>
  );
}
