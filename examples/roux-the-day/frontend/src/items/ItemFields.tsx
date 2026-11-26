import type { SchemaForm } from "@jwcarman/roux-web/form";
import { AssigneesField, type Choice } from "./AssigneesField";
import type { itemSchema } from "./items";

/** An item's fields, as its page changes them. */
export function ItemFields({
  form,
  people,
}: Readonly<{
  form: SchemaForm<typeof itemSchema>;
  people: Choice[];
}>) {
  return (
    <>
      <form.AppField name="title">{(f) => <f.InputField label="Title" />}</form.AppField>
      <form.AppField name="day">{(f) => <f.InputField label="Day" type="date" />}</form.AppField>
      <form.AppField name="allDay">{(f) => <f.CheckboxField label="All day" />}</form.AppField>
      <form.Subscribe selector={(state) => state.values.allDay}>
        {(allDay) =>
          !allDay && (
            <form.AppField name="at">{(f) => <f.InputField label="Time" type="time" required />}</form.AppField>
          )
        }
      </form.Subscribe>
      <form.AppField name="assigneeIds">{() => <AssigneesField label="Assigned to" people={people} />}</form.AppField>
      <form.AppField name="notes">{(f) => <f.TextAreaField label="Notes" />}</form.AppField>
      <form.AppField name="done">{(f) => <f.CheckboxField label="Done" />}</form.AppField>
    </>
  );
}
