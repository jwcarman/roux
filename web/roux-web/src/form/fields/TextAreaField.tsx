import { Textarea, type TextareaProps } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { rulesOfField } from "./fieldRules";
import { FormField, type FormFieldProps } from "./FormField";

/** What TextAreaField takes: the field's label and hint, and any Chakra `Textarea` props but its value's. */
export type TextAreaFieldProps = Omit<TextareaProps, "value" | "onChange" | "onBlur" | "name" | "required"> &
  Omit<FormFieldProps, "children">;

/** A multi-line text input for a string field. */
export function TextAreaField({ label, helperText, required, ...props }: TextAreaFieldProps) {
  const field = useFieldContext<string>();
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <Textarea
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
