import { NativeSelect } from "@chakra-ui/react";
import { useFieldContext } from "../formContext";
import { FormField, type FormFieldProps } from "./FormField";

/** What a select's option can hold: the values an enum, a number list or a yes/no choice has. */
export type SelectValue = string | number | boolean;

/** A choice: the value it sets and the label it shows. */
export interface Option<V extends SelectValue = string> {
  value: V;
  label: string;
}

/** What SelectField takes: the field's label and hint, its options, their labels and a placeholder. */
export type SelectFieldProps<V extends SelectValue = string> = Omit<FormFieldProps, "children"> & {
  /** Bare values (labelled by `labels` or humanized), or values with their labels. */
  options: readonly V[] | readonly Option<V>[];
  /** Labels for bare values, by `String(value)`; the rest are humanized (`ON_HOLD` is `On hold`). */
  labels?: Partial<Record<string, string>>;
  /** Shown while nothing is chosen; the field's value is then "". */
  placeholder?: string;
};

/** `ON_HOLD` as `On hold`: the first letter capital, the rest lower case, underscores as spaces. */
function humanize(value: string): string {
  const words = value.replaceAll("_", " ").toLowerCase();
  return words.charAt(0).toUpperCase() + words.slice(1);
}

function toOption<V extends SelectValue>(option: V | Option<V>, labels: Partial<Record<string, string>>): Option<V> {
  if (typeof option === "object") {
    return option;
  }
  return { value: option, label: labels[String(option)] ?? humanize(String(option)) };
}

/**
 * A drop-down of `options` (the browser's own select: accessible everywhere). The field gets the
 * chosen option's own value, a number or a boolean as much as a string, and `""` for the placeholder.
 */
export function SelectField<V extends SelectValue = string>({
  label,
  helperText,
  required,
  options,
  labels = {},
  placeholder,
}: SelectFieldProps<V>) {
  const field = useFieldContext<V | "">();
  const choices = options.map((option) => toOption(option, labels));
  return (
    <FormField label={label} helperText={helperText} required={required}>
      <NativeSelect.Root>
        <NativeSelect.Field
          name={field.name}
          value={String(field.state.value)}
          onChange={(event) => {
            const chosen = choices.find((choice) => String(choice.value) === event.target.value);
            field.handleChange(chosen?.value ?? "");
          }}
          onBlur={field.handleBlur}
          placeholder={placeholder}
        >
          {choices.map((choice) => (
            <option key={String(choice.value)} value={String(choice.value)}>
              {choice.label}
            </option>
          ))}
        </NativeSelect.Field>
        <NativeSelect.Indicator />
      </NativeSelect.Root>
    </FormField>
  );
}
