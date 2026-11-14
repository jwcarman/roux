import { createFormHook, type AnyFormApi } from "@tanstack/react-form";
import { CheckboxField } from "./fields/CheckboxField";
import { Form, ResetButton, SubmitButton, SubmittingIndicator } from "./fields/formComponents";
import { InputField } from "./fields/InputField";
import { NumberField } from "./fields/NumberField";
import { RadioGroupField } from "./fields/RadioGroupField";
import { SelectField } from "./fields/SelectField";
import { TextAreaField } from "./fields/TextAreaField";
import { fieldContext, formContext } from "./formContext";
import { fieldErrorsOf } from "./errors";
import type { Problem } from "../problem/problem";

/**
 * The app's forms: TanStack Form with Chakra fields.
 *
 *   const form = useAppForm({ defaultValues: { name: "" }, onSubmit: async ({ value }) => ... });
 *   <form.AppForm>
 *     <form.Form>
 *       <form.AppField name="name" validators={{ onBlur: ({ value }) => (value.trim() ? undefined : "Enter a name") }}>
 *         {(field) => <field.InputField label="Name" required />}
 *       </form.AppField>
 *       <form.SubmitButton>Save</form.SubmitButton>
 *     </form.Form>
 *   </form.AppForm>
 */
export const { useAppForm, withForm } = createFormHook({
  fieldContext,
  formContext,
  fieldComponents: { CheckboxField, InputField, NumberField, TextAreaField, SelectField, RadioGroupField },
  formComponents: { Form, SubmitButton, ResetButton, SubmittingIndicator },
});

/**
 * Puts the messages of a 400's field errors (see `fieldErrorsOf`) under their fields; each clears
 * when its field is edited. Returns the messages for fields the form does not show, to show
 * elsewhere. Internal: `useSchemaForm` calls it.
 */
export function placeServerErrors(form: AnyFormApi, problem: Problem): string[] {
  const unplaced: string[] = [];
  for (const [name, message] of Object.entries(fieldErrorsOf(problem))) {
    if (name in form.fieldInfo) {
      form.setFieldMeta(name, (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: message } }));
    } else {
      unplaced.push(message);
    }
  }
  return unplaced;
}
