import { createFormHookContexts } from "@tanstack/react-form";

/** The contexts the field and form components read; see form.tsx. */
export const { fieldContext, useFieldContext, formContext, useFormContext } = createFormHookContexts();
