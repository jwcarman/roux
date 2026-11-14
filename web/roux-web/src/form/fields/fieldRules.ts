import type { AnyFormApi } from "@tanstack/react-form";
import { z } from "zod";
import { fieldRules, type FieldRule } from "../rules";

/** One step into a schema: an object's property or an array's element. */
function step(schema: z.ZodType | undefined, key: string): z.ZodType | undefined {
  if (schema instanceof z.ZodObject) {
    return (schema.shape as Record<string, z.ZodType | undefined>)[key];
  }
  if (schema instanceof z.ZodArray) {
    return schema.element as z.ZodType;
  }
  return undefined;
}

/**
 * What the form's schema says about the field `name` (a TanStack path: `name`, `address.street`,
 * `items[0].name`): whether it is required and its `maxLength`. A form without a schema (a plain
 * `useAppForm`), a name the schema does not have, or a schema not built from roux's rule helpers
 * says `{ required: false }`.
 */
export function rulesOfField(form: AnyFormApi, name: string): FieldRule {
  let schema: z.ZodType | undefined = form.options.validators?.onSubmit as z.ZodType | undefined;
  for (const key of name.split(/[.[\]]+/).filter((part) => part !== "")) {
    schema = step(schema, key);
  }
  return (schema && fieldRules.get(schema)) ?? { required: false };
}
