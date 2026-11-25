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
 * `useAppForm`), or a name the schema does not have, says `{ required: false }`; so does a
 * checkbox's `z.boolean()`. Any other schema not built from roux's rule helpers throws, naming
 * the field: its asterisk, its length limit and the server's words would be lost without a sign.
 */
export function rulesOfField(form: AnyFormApi, name: string): FieldRule {
  let schema: z.ZodType | undefined = form.options.validators?.onSubmit as z.ZodType | undefined;
  for (const key of name.split(/[.[\]]/).filter((part) => part !== "")) {
    schema = step(schema, key);
  }
  if (schema === undefined || schema instanceof z.ZodBoolean) {
    return { required: false };
  }
  const rule = fieldRules.get(schema);
  if (rule === undefined) {
    throw new Error(
      `The schema of field "${name}" is not one of roux's rules, so the field cannot show whether it is ` +
        "required or how long it may be. Build it with a rule from @jwcarman/roux-web/form (text(), email(), " +
        "date(), oneOf(), ...); a .transform() or .pipe() makes a new schema, so keep them out of a form's " +
        "schema; a rule of your own ends with .register(fieldRules, { required }).",
    );
  }
  return rule;
}
