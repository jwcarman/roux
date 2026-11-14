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
import { notify } from "../feedback/notify";
import { problemOf } from "../problem/problem";

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
 * Shows the server's messages from a 400 under their fields (see `fieldErrorsOf`); each clears
 * when its field is edited. Returns the messages for fields the form does not have, to show
 * elsewhere.
 */
export function showServerErrors(form: AnyFormApi, fields: Record<string, string>): string[] {
  const unplaced: string[] = [];
  for (const [name, message] of Object.entries(fields)) {
    if (name in form.fieldInfo) {
      form.setFieldMeta(name, (meta) => ({ ...meta, errorMap: { ...meta.errorMap, onServer: message } }));
    } else {
      unplaced.push(message);
    }
  }
  return unplaced;
}

/**
 * Tells the user why the server refused a form: each field error goes under its field (a server
 * field can be named to a form field with `fieldNames`, such as `{ rule: "days" }`), messages with
 * no field to go under are toasted under `fallback`, and a refusal without field errors toasts the
 * server's reason, or `fallback` when it gave none.
 */
export async function showProblem(
  form: AnyFormApi,
  response: Response,
  fallback: string,
  fieldNames: Record<string, string> = {},
): Promise<void> {
  const problem = await problemOf(response);
  if (problem.errors === undefined) {
    notify.problem(problem, fallback);
    return;
  }
  const fields: Record<string, string> = {};
  for (const [name, message] of Object.entries(fieldErrorsOf(problem))) {
    fields[fieldNames[name] ?? name] = message;
  }
  const unplaced = showServerErrors(form, fields);
  if (unplaced.length > 0) {
    notify.error(fallback, unplaced.join(" "));
  }
}
