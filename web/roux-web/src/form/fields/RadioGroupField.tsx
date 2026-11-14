import { RadioGroup, Stack } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";
import type { Option } from "./SelectField";

export type RadioGroupFieldProps = Omit<FormFieldProps, "children"> & {
  options: readonly Option[];
  orientation?: "horizontal" | "vertical";
};

/** One choice of `options` for a string field, as radio buttons. */
export function RadioGroupField({
  label,
  helperText,
  required,
  options,
  orientation = "vertical",
}: RadioGroupFieldProps) {
  const field = useFieldContext<string>();
  return (
    // A radio group is named by its own group label, not a <label> pointing at one input.
    <FormField label={label} helperText={helperText} required={required} controlLabelled>
      <RadioGroup.Root
        name={field.name}
        value={field.state.value}
        onValueChange={({ value }) => field.handleChange(value ?? "")}
        onBlur={field.handleBlur}
      >
        <RadioGroup.Label>{label}</RadioGroup.Label>
        <Stack direction={orientation === "vertical" ? "column" : "row"} gap="3">
          {options.map((option) => (
            <RadioGroup.Item key={option.value} value={option.value}>
              <RadioGroup.ItemHiddenInput />
              <RadioGroup.ItemIndicator />
              <RadioGroup.ItemText>{option.label}</RadioGroup.ItemText>
            </RadioGroup.Item>
          ))}
        </Stack>
      </RadioGroup.Root>
    </FormField>
  );
}
