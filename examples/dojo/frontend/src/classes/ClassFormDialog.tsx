import type { ReactElement } from "react";
import { useQuery } from "@tanstack/react-query";
import { notify } from "@jwcarman/roux-web/feedback";
import { FormDialog, inputOf, timeInputOf, useSchemaForm } from "@jwcarman/roux-web/form";
import {
  classRequestSchema,
  createClass,
  instructorsQuery,
  updateClass,
  WEEKDAYS,
  WEEKDAY_LABELS,
  type SchoolClass,
} from "./classes";

/** "New class", or "Edit" for the class given (at the version shown), in a dialog. */
export function ClassFormDialog({ schoolClass, trigger }: { schoolClass?: SchoolClass; trigger: ReactElement }) {
  const instructors = useQuery(instructorsQuery);
  const form = useSchemaForm({
    schema: classRequestSchema,
    defaultValues: schoolClass
      ? {
          name: schoolClass.name,
          weekday: schoolClass.weekday,
          startsAt: timeInputOf(schoolClass.startsAt),
          endsAt: timeInputOf(schoolClass.endsAt),
          instructorId: inputOf(schoolClass.instructorId),
        }
      : { name: "", weekday: "", startsAt: "", endsAt: "", instructorId: "" },
    mutation: schoolClass ? updateClass(schoolClass.id, schoolClass.version) : createClass,
    onSuccess: (saved) => notify.success(`${saved.name} was saved`),
    failure: "Could not save the class",
  });
  const options = (instructors.data ?? []).map((instructor) => ({ value: instructor.id, label: instructor.name }));

  return (
    <FormDialog form={form} title={schoolClass ? `Edit ${schoolClass.name}` : "New class"} trigger={trigger}>
      <form.AppField name="name">{(f) => <f.InputField label="Name" autoComplete="off" />}</form.AppField>
      <form.AppField name="weekday">
        {(f) => <f.SelectField label="Day" options={WEEKDAYS} labels={WEEKDAY_LABELS} placeholder="Choose a day" />}
      </form.AppField>
      <form.AppField name="startsAt">{(f) => <f.InputField label="Starts" type="time" />}</form.AppField>
      <form.AppField name="endsAt">{(f) => <f.InputField label="Ends" type="time" />}</form.AppField>
      <form.AppField name="instructorId">
        {(f) => <f.SelectField label="Instructor" options={options} placeholder="No instructor" />}
      </form.AppField>
    </FormDialog>
  );
}
